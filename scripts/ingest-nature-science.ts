import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from 'undici';
import { load } from 'cheerio';
import { PDFParse } from 'pdf-parse';
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
  const parser = new PDFParse({
    data: pdfBuffer,
    disableAutoFetch: true,
    disableStream: true
  });

  try {
    const { text } = await parser.getText({
      pageJoiner: '\n\n',
      itemJoiner: ' ',
      lineEnforce: true
    });
    return text;
  } finally {
    await parser.destroy();
  }
}

async function processPdf(pdfUrl: string, storageDir: string, processed: Set<string>): Promise<void> {
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
  const summary = await generateSummary({ title, abstract: truncatedText });

  const escapedTitle = escapeHtml(title);
  const escapedSummary = escapeHtml(summary.text);
  const messageLines = [
    `📘 <b>${escapedTitle}</b>`,
    '',
    escapedSummary,
    '',
    `Оригинал: ${pdfUrl}`,
    '',
    '#NatureScience #SummIt'
  ];

  const message = messageLines.join('\n');
  await sendPlainTextToChannel(message);

  processed.add(pdfUrl);
  logger.info({ pdfUrl }, 'PDF processed and summary sent');
  await delay(1_000); // small delay to avoid hitting rate limits
}

async function main(): Promise<void> {
  const config = getConfig();
  if (!config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to generate summaries');
  }

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
      logger.error(
        {
          page,
          error: error instanceof Error ? { message: error.message, stack: error.stack } : error
        },
        'Failed to fetch page links'
      );
    }
  }

  if (allLinks.size === 0) {
    logger.warn('No PDF links discovered. Nothing to process.');
    return;
  }

  for (const pdfUrl of allLinks) {
    try {
      await processPdf(pdfUrl, pdfDir, processed);
      await saveProcessedSet(processedFilePath, processed);
    } catch (error) {
      logger.error(
        {
          pdfUrl,
          error: error instanceof Error ? { message: error.message, stack: error.stack } : error
        },
        'Failed to process PDF'
      );
    }
  }

  logger.info('Processing completed');
}

void main().catch((error) => {
  logger.error({ error }, 'Fatal error while processing Nature Science PDFs');
  process.exitCode = 1;
});
