import { prisma } from '../../../packages/db/index.ts';
import { createConsumer, createQueueContext, publishMessage } from '../../../packages/queue/index.ts';
import { logger } from '../../../packages/logger/index.ts';
import { generateSummary } from '../../../packages/summarization/index.ts';
import { getConfig } from '../../../packages/config/index.ts';

const config = getConfig();

async function handleSummarizeRequest(message: Record<string, unknown>): Promise<void> {
  const articleId = message.articleId as string | undefined;
  if (!articleId) {
    logger.warn({ message }, 'Summarize request missing articleId');
    return;
  }

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { articleText: true }
  });

  if (!article) {
    logger.error({ articleId }, 'Article not found for summarization');
    return;
  }

  const abstract = article.articleText?.cleanedText ?? article.articleText?.rawText ?? '';
  if (!abstract) {
    logger.warn({ articleId }, 'No text available for summarization');
    return;
  }

  const summaryResult = await generateSummary({
    title: article.title,
    abstract
  });

  const summary = await prisma.summary.create({
    data: {
      articleId: article.id,
      text: summaryResult.text,
      needsReview: summaryResult.needsReview,
      createdBy: 'openai'
    }
  });

  const publication = await prisma.publication.create({
    data: {
      summaryId: summary.id,
      channelId: config.CHANNEL_CHAT_ID,
      status: 'draft'
    }
  });

  const queue = await createQueueContext();
  await publishMessage(queue, 'publication.draft.request', {
    summaryId: summary.id,
    publicationId: publication.id
  });
  await queue.connection.close();

  logger.info({ articleId, summaryId: summary.id }, 'Summary generated and draft queued');
}

async function bootstrap() {
  logger.info('Summarizer service starting');
  await createConsumer('summarizer', 'summarize.request', async (message: Record<string, unknown>) => {
    try {
      await handleSummarizeRequest(message);
    } catch (error) {
      logger.error({ error }, 'Failed to handle summarize request');
      throw error;
    }
  });
}

void bootstrap();
