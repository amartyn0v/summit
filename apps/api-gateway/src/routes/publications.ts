import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../../packages/db/index.ts';
import { createQueueContext, publishMessage } from '../../../../packages/queue/index.ts';

const approveSchema = z.object({
  approvedBy: z.string().min(1)
});

export async function registerPublicationRoutes(fastify: FastifyInstance) {
  fastify.get('/', async () => {
    return prisma.publication.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        summary: {
          include: { article: true }
        }
      }
    });
  });

  fastify.post('/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = approveSchema.parse(request.body);

    const publication = await prisma.publication.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: payload.approvedBy,
        approvedAt: new Date()
      },
      include: {
        summary: {
          include: { article: true }
        }
      }
    });

    const queue = await createQueueContext();
    await publishMessage(queue, 'publication.approved', {
      publicationId: publication.id,
      summaryId: publication.summaryId
    });
    await queue.connection.close();

    reply.code(202);
    return publication;
  });
}
