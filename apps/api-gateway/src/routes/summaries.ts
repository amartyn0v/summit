import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../../packages/db/index.ts';
import { createQueueContext, publishMessage } from '../../../../packages/queue/index.ts';

const articlePayloadSchema = z.object({
  sourceId: z.string().cuid(),
  externalId: z.string().optional(),
  title: z.string().min(1),
  url: z.string().url(),
  fulltextUrl: z.string().url().optional(),
  journal: z.string().optional(),
  year: z.number().int().optional(),
  license: z.string().optional(),
  language: z.string().optional(),
  authors: z.array(z.string()).min(1),
  publishedAt: z.string().datetime().optional(),
  abstract: z.string().min(1),
  rawText: z.string().optional(),
  cleanedText: z.string().optional()
});

export async function registerSummaryRoutes(fastify: FastifyInstance) {
  fastify.get('/', async () => {
    return prisma.summary.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        article: true,
        publications: true
      }
    });
  });

  fastify.post('/', async (request, reply) => {
    const payload = articlePayloadSchema.parse(request.body);

    let article;
    if (payload.externalId) {
      article = await prisma.article.upsert({
        where: { externalId: payload.externalId },
        update: {
          title: payload.title,
          url: payload.url,
          fulltextUrl: payload.fulltextUrl,
          journal: payload.journal,
          year: payload.year,
          license: payload.license,
          language: payload.language,
          authors: payload.authors,
          publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : null
        },
        create: {
          sourceId: payload.sourceId,
          externalId: payload.externalId,
          title: payload.title,
          url: payload.url,
          fulltextUrl: payload.fulltextUrl,
          journal: payload.journal,
          year: payload.year,
          license: payload.license,
          language: payload.language,
          authors: payload.authors,
          publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : null
        }
      });
    } else {
      article = await prisma.article.create({
        data: {
          sourceId: payload.sourceId,
          title: payload.title,
          url: payload.url,
          fulltextUrl: payload.fulltextUrl,
          journal: payload.journal,
          year: payload.year,
          license: payload.license,
          language: payload.language,
          authors: payload.authors,
          publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : null
        }
      });
    }

    const rawText = payload.rawText ?? payload.abstract;
    const cleanedText = payload.cleanedText ?? payload.abstract;

    await prisma.articleText.upsert({
      where: { articleId: article.id },
      update: {
        rawText,
        cleanedText,
        ocrUsed: false
      },
      create: {
        articleId: article.id,
        rawText,
        cleanedText,
        ocrUsed: false
      }
    });

    const queue = await createQueueContext();
    await publishMessage(queue, 'summarize.request', {
      articleId: article.id,
      sourceId: payload.sourceId
    });
    await queue.connection.close();

    reply.code(202);
    return { articleId: article.id, status: 'queued' };
  });
}
