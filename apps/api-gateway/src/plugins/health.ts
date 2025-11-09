import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../../../../packages/db/index.ts';

export const registerHealthPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  });
});
