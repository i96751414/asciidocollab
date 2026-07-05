import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { authPluginWrapped } from './plugins/auth';
import { collabAuthRoute } from './routes/internal/collab-auth';
import { collabContentChangedRoute } from './routes/internal/collab-content-changed';
import { storageProbeRoute } from './routes/internal/storage-probe';
import type { AppContainer } from '.';
import type { Config } from './config/schema';
import type { FileTreeEventBus } from './plugins/file-tree-event-bus';

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
  /** The per-project event bus shared with the main server, so content-changed emits reach SSE subscribers. */
  fileTreeEventBus: FileTreeEventBus;
}

/**
 * Creates the internal Fastify server that hosts the collaboration trust-boundary endpoints — collab
 * auth, the storage-consistency probe, and the collab→API content-changed notify relay (which emits
 * onto the shared per-project event bus so the main server's SSE subscribers refresh). When TLS cert
 * paths are configured the server requires mutual TLS; otherwise it binds to loopback over plain HTTP.
 */
export async function createInternalServer(deps: InternalServerDeps): Promise<FastifyInstance> {
  const { cert, key, clientCa } = deps.config.collab.internalTls;
  const useTls = Boolean(cert && key && clientCa);

  const app: FastifyInstance = useTls
    ? Fastify({
        logger: false,
        https: {
          requestCert: true,
          rejectUnauthorized: true,
          ca: readFileSync(clientCa),
          cert: readFileSync(cert),
          key: readFileSync(key),
        },
      })
    : Fastify({ logger: false });

  app.decorate('config', deps.config);
  app.decorate('prisma', deps.prisma);
  app.decorate('repos', deps.repos);
  app.decorate('services', deps.services);
  app.decorate('fileTreeEventBus', deps.fileTreeEventBus);

  app.register(authPluginWrapped);
  app.register(collabAuthRoute);
  app.register(collabContentChangedRoute);
  app.register(storageProbeRoute);

  return app;
}
