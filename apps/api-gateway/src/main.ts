import Fastify from 'fastify';
import fastifySensible from '@fastify/sensible';
import { getConfig } from '../../../packages/config/index.ts';
import { logger } from '../../../packages/logger/index.ts';
import { registerHealthPlugin } from './plugins/health.ts';
import { registerSummaryRoutes } from './routes/summaries.ts';
import { registerSourceRoutes } from './routes/sources.ts';
import { registerPublicationRoutes } from './routes/publications.ts';

export async function buildServer() {
  const config = getConfig();
  const server = Fastify({
    logger: logger,
    disableRequestLogging: true
  });

  await server.register(fastifySensible);
  await server.register(registerHealthPlugin);
  await server.register(registerSourceRoutes, { prefix: '/sources' });
  await server.register(registerSummaryRoutes, { prefix: '/summaries' });
  await server.register(registerPublicationRoutes, { prefix: '/publications' });

  server.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.header('WWW-Authenticate', 'Basic realm="summit-admin"');
      return reply.unauthorized('Missing credentials');
    }

    const credentials = Buffer.from(authHeader.split(' ')[1] ?? '', 'base64').toString();
    const [user, password] = credentials.split(':');
    const expectedUser = process.env.BASIC_AUTH_USER ?? 'admin';
    const expectedPassword = process.env.BASIC_AUTH_PASSWORD ?? 'admin';
    if (user !== expectedUser || password !== expectedPassword) {
      reply.header('WWW-Authenticate', 'Basic realm="summit-admin"');
      return reply.unauthorized('Invalid credentials');
    }
  });

  const port = Number(process.env.PORT ?? 3000);

  const start = async () => {
    try {
      await server.listen({ port, host: '0.0.0.0' });
      logger.info({ port, tzAdmin: config.TZ_ADMIN }, 'API Gateway started');
    } catch (error) {
      logger.error({ error }, 'Failed to start API Gateway');
      process.exit(1);
    }
  };

  if (process.env.NODE_ENV !== 'test') {
    await start();
  }

  return server;
}

void buildServer();
