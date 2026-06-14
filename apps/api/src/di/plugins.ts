import type { FastifyInstance } from 'fastify';
import { authPluginWrapped } from '../plugins/auth';
import { originCheckPlugin } from '../plugins/origin-check';
import { rateLimitPluginWrapped } from '../plugins/rate-limit';
import { corsPluginWrapped } from '../plugins/cors';
import { httpsRedirectPluginWrapped } from '../plugins/https-redirect';
import { errorHandler, notFoundHandler } from '../plugins/error-handler';
import { fileTreeEventBusPlugin } from '../plugins/file-tree-event-bus';
import { failedSignInPurge } from '../plugins/failed-sign-in-purge';

/**
 * Registers all Fastify plugins and the global error/not-found handlers in the
 * exact order required by the server bootstrap.
 *
 * @param app - The Fastify instance to register plugins onto.
 */
export async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(fileTreeEventBusPlugin);
  await app.register(failedSignInPurge);

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(httpsRedirectPluginWrapped);
  await app.register(corsPluginWrapped);
  await app.register(authPluginWrapped);
  await app.register(rateLimitPluginWrapped);
  await app.register(originCheckPlugin);
}
