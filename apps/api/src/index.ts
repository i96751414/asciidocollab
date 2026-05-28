import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { envConfig } from './config/env';
import { authPluginWrapped } from './plugins/auth';
import { rateLimitPluginWrapped } from './plugins/rate-limit';
import { corsPluginWrapped } from './plugins/cors';
import { httpsRedirectPluginWrapped } from './plugins/https-redirect';
import { errorHandler, notFoundHandler } from './plugins/error-handler';
import { healthRoute } from './routes/health';

/** Dependency injection container for the application. */
export interface AppContainer {
  /** Prisma client instance for database access. */
  prisma: PrismaClient;
}

/**
 * Builds and configures the Fastify server instance.
 *
 * @param overrides - Optional dependency overrides for testing.
 * @returns A configured Fastify instance ready to listen.
 */
export async function buildServer(overrides?: Partial<AppContainer>) {
  const app = Fastify({
    logger: {
      level: 'info',
      redact: ['req.headers.cookie', 'req.body.password', 'req.body.currentPassword', 'req.body.newPassword', 'req.body.token', 'req.body.email'],
    },
  });

  await app.register(envConfig);

  if (overrides?.prisma) {
    app.decorate('prisma', overrides.prisma);
  }

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(httpsRedirectPluginWrapped);
  await app.register(corsPluginWrapped);
  await app.register(authPluginWrapped);
  await app.register(rateLimitPluginWrapped);

  await app.register(healthRoute);

  return app;
}

async function start() {
  const prisma = new PrismaClient();
  const app = await buildServer({ prisma });
  const port = parseInt(process.env.ASCIIDOCOLLAB_API_PORT ?? '4000', 10);
  const host = process.env.ASCIIDOCOLLAB_API_HOST ?? '0.0.0.0';
  await app.listen({ port, host });
}

if (require.main === module) {
  start().catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
