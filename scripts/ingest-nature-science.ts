import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from 'undici';
import { load } from 'cheerio';
import pdfParse from 'pdf-parse';
import type { AppConfig } from '../packages/config/env.ts';
import { getConfig } from '../packages/config/index.ts';
import { logger } from '../packages/logger/index.ts';
import { generateSummary } from '../packages/summarization/index.ts';
import { sendPlainTextToChannel } from '../packages/telegram/index.ts';

const TARGET_PAGES = [
  'https://naturesciencemagazine.in/nature-science-e-magazine-9/',
  'https://naturesciencemagazine.in/archives/'
];

const SITE_ORIGIN = 'https://naturesciencemagazine.in';

const PAGE_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  referer: SITE_ORIGIN,
  'cache-control': 'no-cache'
} as const;

const PDF_HEADERS = {
  ...PAGE_HEADERS,
  accept: 'application/pdf'
} as const;

const MAX_TEXT_LENGTH = 24_000;
const STORAGE_SUBDIR = 'naturescience';
const PROCESSED_FILE = 'processed.json';

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message
    };

    if (error.stack) {
      payload.stack = error.stack;
    }

    if ('cause' in error && (error as Error & { cause?: unknown }).cause) {
      payload.cause = (error as Error & { cause?: unknown }).cause;
    }

    return payload;
  }

  if (typeof error === 'object' && error !== null) {
    return { ...error } as Record<string, unknown>;
  }

  return { value: error };
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function fetchPdfLinks(pageUrl: string): Promise<string[]> {
  logger.info({ pageUrl }, 'Fetching page');
  const response = await request(pageUrl, {
    headers: PAGE_HEADERS,
    maxRedirections: 5
  });
  if (response.statusCode >= 400) {
    throw new Error(`Failed to fetch ${pageUrl}: ${response.statusCode}`);
  }

  const html = await response.body.text();
  const $ = load(html);
  const links = new Set<string>();

  $('a').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) {
      return;
    }

    const absoluteUrl = new URL(href, pageUrl).toString();
    if (absoluteUrl.toLowerCase().endsWith('.pdf')) {
      links.add(absoluteUrl);
    }
  });

  return Array.from(links);
}

async function downloadPdf(url: string, destination: string): Promise<Buffer> {
  logger.info({ url }, 'Downloading PDF');
  const response = await request(url, {
    headers: PDF_HEADERS,
    maxRedirections: 5
  });
  if (response.statusCode >= 400) {
    throw new Error(`Failed to download ${url}: ${response.statusCode}`);
  }

  const arrayBuffer = await response.body.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0 || !buffer.slice(0, 4).toString().startsWith('%PDF')) {
    throw new Error('Downloaded file is not a valid PDF document');
  }
  await writeFile(destination, buffer);
  return buffer;
}

function deriveTitleFromUrl(pdfUrl: string): string {
  try {
    const { pathname } = new URL(pdfUrl);
    const filename = pathname.split('/').filter(Boolean).pop() ?? 'Nature Science Article';
    return decodeURIComponent(filename.replace(/[-_]+/g, ' ')).replace(/\.pdf$/i, '').trim();
  } catch (error) {
    logger.warn({ pdfUrl, error }, 'Could not parse PDF filename, falling back to default title');
    return 'Nature Science Article';
  }
}

async function ensureStorageDir(root: string): Promise<string> {
  const pdfDir = path.join(root, STORAGE_SUBDIR);
  await mkdir(pdfDir, { recursive: true });
  return pdfDir;
}

async function loadProcessedSet(filePath: string): Promise<Set<string>> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as string[];
    return new Set(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Set();
    }
    throw error;
  }
}

async function saveProcessedSet(filePath: string, data: Set<string>): Promise<void> {
  const payload = JSON.stringify(Array.from(data), null, 2);
  await writeFile(filePath, payload, 'utf8');
}

async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const { text } = await pdfParse(pdfBuffer);
  return text;
}

function buildFallbackSummary(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Не удалось извлечь текст из PDF. Требуется ручная проверка оригинала.';
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/u).filter(Boolean);
  const selected: string[] = [];
  let totalLength = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) {
      continue;
    }

    const projectedLength = totalLength + (totalLength > 0 ? 1 : 0) + trimmed.length;
    if (selected.length >= 3 || projectedLength > maxLength) {
      break;
    }

    selected.push(trimmed);
    totalLength += trimmed.length + (totalLength > 0 ? 1 : 0);
  }

  const fallback = (selected.length > 0 ? selected.join(' ') : normalized.slice(0, maxLength)).slice(0, maxLength);
  return fallback || 'Не удалось автоматически построить саммари. Ознакомьтесь с оригиналом.';
}

interface SummaryOutcome {
  text: string;
  needsReview: boolean;
  usedFallback: boolean;
}

async function summarizeWithFallback(
  pdfUrl: string,
  title: string,
  truncatedText: string,
  config: AppConfig
): Promise<SummaryOutcome> {
  try {
    const result = await generateSummary({ title, abstract: truncatedText });
    return {
      text: result.text,
      needsReview: result.needsReview,
      usedFallback: false
    };
  } catch (error) {
    logger.warn({ pdfUrl, error: serializeError(error) }, 'OpenAI summary failed, using fallback text extraction');

    const fallback = buildFallbackSummary(truncatedText, config.SUMMARY_MAX_LENGTH);
    return {
      text: fallback,
      needsReview: true,
      usedFallback: true
    };
  }
}

async function processPdf(
  pdfUrl: string,
  storageDir: string,
  processed: Set<string>,
  config: AppConfig
): Promise<void> {
  if (processed.has(pdfUrl)) {
    logger.info({ pdfUrl }, 'Skipping already processed PDF');
    return;
  }

  const title = deriveTitleFromUrl(pdfUrl);
  const safeSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const filename = `${safeSlug || 'nature-science'}-${Date.now()}.pdf`;
  const filePath = path.join(storageDir, filename);

  const pdfBuffer = await downloadPdf(pdfUrl, filePath);
  const rawText = await extractPdfText(pdfBuffer);
  const text = rawText.replace(/\s+/g, ' ').trim();

  if (!text) {
    logger.warn({ pdfUrl }, 'PDF text extraction returned empty result, skipping');
    return;
  }

  const truncatedText = text.slice(0, MAX_TEXT_LENGTH);
  const summary = await summarizeWithFallback(pdfUrl, title, truncatedText, config);

  const escapedTitle = escapeHtml(title);
  const escapedSummary = escapeHtml(summary.text);
  const notes: string[] = [];

  if (summary.usedFallback) {
    notes.push('⚠️ Саммари сгенерировано локально без OpenAI — требуется проверка.');
  }

  if (summary.needsReview && !summary.usedFallback) {
    notes.push('⚠️ Ответ OpenAI был обрезан до допустимой длины.');
  }

  const messageLines = [
    `📘 <b>${escapedTitle}</b>`,
    '',
    ...notes.map((note) => escapeHtml(note)),
    notes.length > 0 ? '' : undefined,
    escapedSummary,
    '',
    `Оригинал: ${pdfUrl}`,
    '',
    '#NatureScience #SummIt'
  ].filter((line): line is string => line !== undefined);

  const message = messageLines.join('\n');
  await sendPlainTextToChannel(message);

  processed.add(pdfUrl);
  logger.info({ pdfUrl }, 'PDF processed and summary sent');
  await delay(1_000); // small delay to avoid hitting rate limits
}

async function main(): Promise<void> {
  const config = getConfig();

  const storageRoot = path.resolve(process.cwd(), config.STORAGE_DIR);
  const pdfDir = await ensureStorageDir(storageRoot);
  const processedFilePath = path.join(pdfDir, PROCESSED_FILE);
  const processed = await loadProcessedSet(processedFilePath);

  const allLinks = new Set<string>();
  for (const page of TARGET_PAGES) {
    try {
      const links = await fetchPdfLinks(page);
      logger.info({ page, count: links.length }, 'Found PDF links');
      links.forEach((link) => allLinks.add(link));
    } catch (error) {
      logger.error({ page, error: serializeError(error) }, 'Failed to fetch page links');
    }
  }

  if (allLinks.size === 0) {
    logger.warn('No PDF links discovered. Nothing to process.');
    return;
  }

  for (const pdfUrl of allLinks) {
    try {
      await processPdf(pdfUrl, pdfDir, processed, config);
      await saveProcessedSet(processedFilePath, processed);
    } catch (error) {
      logger.error({ pdfUrl, error: serializeError(error) }, 'Failed to process PDF');
    }
  }

  logger.info('Processing completed');
}

void main().catch((error) => {
  logger.error({ error }, 'Fatal error while processing Nature Science PDFs');
  process.exitCode = 1;
});
