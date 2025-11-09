import cron from 'node-cron';
import { prisma } from '../../../packages/db/index.ts';
import { createQueueContext, publishMessage } from '../../../packages/queue/index.ts';
import { getConfig } from '../../../packages/config/index.ts';
import { logger } from '../../../packages/logger/index.ts';

const config = getConfig();

async function dispatchCrawlJobs(): Promise<void> {
  const sources = await prisma.source.findMany({ where: { enabled: true } });
  if (sources.length === 0) {
    logger.warn('No sources enabled for crawling');
    return;
  }

  const queue = await createQueueContext();
  for (const source of sources) {
    await publishMessage(queue, 'crawl.start', {
      sourceId: source.id,
      schedule: source.schedule ?? `${config.SCHEDULER_START_HOUR}:00-${config.SCHEDULER_END_HOUR}:00`
    });
  }
  await queue.connection.close();
  logger.info({ count: sources.length }, 'Crawl jobs dispatched');
}

async function dispatchPublicationJobs(): Promise<void> {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const publications = await prisma.publication.findMany({
    where: {
      status: 'approved',
      approvedAt: {
        not: null,
        gte: since,
        lt: now
      }
    },
    include: {
      summary: {
        include: { article: true }
      }
    }
  });

  if (publications.length === 0) {
    logger.info('No approved publications to schedule');
    return;
  }

  const queue = await createQueueContext();
  for (const publication of publications) {
    await prisma.publication.update({
      where: { id: publication.id },
      data: {
        status: 'scheduled',
        scheduledAt: now
      }
    });
    await publishMessage(queue, 'publication.schedule', {
      publicationId: publication.id,
      summaryId: publication.summaryId
    });
  }
  await queue.connection.close();
  logger.info({ count: publications.length }, 'Publication jobs dispatched');
}

function bootstrapScheduler() {
  logger.info('Scheduler service starting');

  cron.schedule(
    `0 ${config.SCHEDULER_START_HOUR} * * *`,
    () => {
      void dispatchCrawlJobs();
    },
    {
      timezone: config.TIMEZONE_PUBLICATION
    }
  );

  cron.schedule(
    `0 ${config.PUBLICATION_HOUR_MSK} * * *`,
    () => {
      void dispatchPublicationJobs();
    },
    {
      timezone: config.TIMEZONE_PUBLICATION
    }
  );

  // Run once on startup in development for verification.
  if (process.env.NODE_ENV === 'development') {
    void dispatchCrawlJobs();
    void dispatchPublicationJobs();
  }
}

bootstrapScheduler();
