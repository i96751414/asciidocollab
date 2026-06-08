import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { authPluginWrapped } from './plugins/auth';
import { collabAuthRoute } from './routes/internal/collab-auth';
import type { AppContainer } from '.';
import type { Config } from './config/schema';

/** Dependencies required to build the internal Fastify server for collaboration auth. */
export interface InternalServerDeps {
  /** Prisma client for database access. */
  prisma: PrismaClient;
  /** Full repository container; only document and projectMember are used internally. */
  repos: AppContainer['repos'];
  /** Full services container; only prismaSessionStore is used internally. */
  services: AppContainer['services'];
  /** Application configuration. */
  config: Config;
}

/** Creates the internal Fastify server that exposes the collab auth endpoint on the loopback interface. */
export async function createInternalServer(deps: InternalServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.decorate('config', deps.config);
  app.decorate('prisma', deps.prisma);
  app.decorate('repos', deps.repos);
  app.decorate('services', deps.services);

  await app.register(authPluginWrapped);
  await app.register(collabAuthRoute);

  return app;
}
