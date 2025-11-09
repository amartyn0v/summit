import { prisma } from '../../../packages/db/index.ts';
import { createConsumer } from '../../../packages/queue/index.ts';
import { logger } from '../../../packages/logger/index.ts';
import { buildDraftMessage, sendDraftToOwner, sendPublicationToChannel } from '../../../packages/telegram/index.ts';

async function handleDraftRequest(message: Record<string, unknown>): Promise<void> {
  const summaryId = message.summaryId as string | undefined;
  const publicationId = message.publicationId as string | undefined;

  if (!summaryId || !publicationId) {
    logger.warn({ message }, 'Draft request missing identifiers');
    return;
  }

  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: {
      summary: {
        include: { article: true }
      }
    }
  });

  if (!publication) {
    logger.error({ publicationId }, 'Publication not found for draft request');
    return;
  }

  const summary = publication.summary;
  const article = summary.article;

  const authors = Array.isArray(article.authors)
    ? (article.authors as unknown[]).map((author) => String(author))
    : [];

  const isPreprint = article.journal?.toLowerCase().includes('arxiv') ?? false;

  const messageText = buildDraftMessage({
    title: article.title,
    summary: summary.text,
    url: article.url,
    authors,
    doi: article.externalId ?? undefined,
    journal: article.journal ?? undefined,
    year: article.year ?? undefined,
    isPreprint
  });

  const previewMessageId = await sendDraftToOwner({
    title: article.title,
    summary: summary.text,
    url: article.url,
    authors,
    doi: article.externalId ?? undefined,
    journal: article.journal ?? undefined,
    year: article.year ?? undefined,
    isPreprint
  });

  logger.debug({ publicationId, summaryId, messageText }, 'Draft prepared');

  await prisma.publication.update({
    where: { id: publicationId },
    data: {
      dmPreviewMessageId: previewMessageId ?? null
    }
  });

  logger.info({ publicationId, summaryId }, 'Draft sent to owner');
}

async function handleScheduledPublication(message: Record<string, unknown>): Promise<void> {
  const publicationId = message.publicationId as string | undefined;
  if (!publicationId) {
    logger.warn({ message }, 'Scheduled publication missing id');
    return;
  }

  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: {
      summary: {
        include: { article: true }
      }
    }
  });

  if (!publication) {
    logger.error({ publicationId }, 'Publication not found for schedule');
    return;
  }

  const article = publication.summary.article;
  const authors = Array.isArray(article.authors)
    ? (article.authors as unknown[]).map((author) => String(author))
    : [];
  const isPreprint = article.journal?.toLowerCase().includes('arxiv') ?? false;

  const messageText = buildDraftMessage({
    title: article.title,
    summary: publication.summary.text,
    url: article.url,
    authors,
    doi: article.externalId ?? undefined,
    journal: article.journal ?? undefined,
    year: article.year ?? undefined,
    isPreprint
  });

  const messageId = await sendPublicationToChannel(messageText);

  await prisma.publication.update({
    where: { id: publicationId },
    data: {
      status: 'sent',
      sentAt: new Date(),
      retryCount: 0
    }
  });

  logger.info({ publicationId, messageId }, 'Publication sent to channel');
}

async function bootstrapPublisher() {
  logger.info('Publisher service starting');
  await createConsumer('publisher-drafts', 'publication.draft.request', async (message: Record<string, unknown>) => {
    try {
      await handleDraftRequest(message);
    } catch (error) {
      logger.error({ error }, 'Failed to handle draft request');
      throw error;
    }
  });

  await createConsumer('publisher-schedule', 'publication.schedule', async (message: Record<string, unknown>) => {
    try {
      await handleScheduledPublication(message);
    } catch (error) {
      logger.error({ error }, 'Failed to handle scheduled publication');
      throw error;
    }
  });
}

void bootstrapPublisher();
