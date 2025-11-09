import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../../packages/db/index.ts';

const createSourceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['rss', 'api', 'html']),
  baseUrl: z.string().url(),
  schedule: z.string().optional(),
  rateLimit: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  defaultTags: z.array(z.string()).optional()
});

export async function registerSourceRoutes(fastify: FastifyInstance) {
  fastify.get('/', async () => {
    return prisma.source.findMany();
  });

  fastify.post('/', async (request, reply) => {
    const payload = createSourceSchema.parse(request.body);
    const source = await prisma.source.create({
      data: {
        name: payload.name,
        type: payload.type,
        baseUrl: payload.baseUrl,
        schedule: payload.schedule,
        rateLimit: payload.rateLimit,
        enabled: payload.enabled ?? true,
        priority: payload.priority ?? 0,
        defaultTags: payload.defaultTags ?? []
      }
    });
    reply.code(201);
    return source;
  });
}
