import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const PLACEHOLDER_URL = 'https://asciidocollab.example.com';

async function originCheck(app: FastifyInstance): Promise<void> {
  const allowedOrigin =
    app.config?.api?.frontendUrl ??
    process.env.ASCIIDOCOLLAB_API_FRONTEND_URL ??
    process.env.FRONTEND_URL;

  if (!allowedOrigin) {
    app.log.error(
      'origin-check: no frontend URL configured and ASCIIDOCOLLAB_API_FRONTEND_URL is not set. ' +
      'Origin enforcement is DISABLED — set the env var to enable CSRF protection.',
    );
    return;
  }

  if (allowedOrigin === PLACEHOLDER_URL) {
    app.log.warn(
      'origin-check: api.frontendUrl is set to the placeholder default. ' +
      'Set ASCIIDOCOLLAB_API_FRONTEND_URL to your actual frontend URL or origin checks will reject browser requests.',
    );
  }

  app.addHook('preHandler', async (request, reply) => {
    // Skip in test environment — integration tests use inject() which has no Origin header.
    if (process.env.NODE_ENV === 'test') return;
    if (!MUTATING_METHODS.has(request.method)) return;

    const requestOrigin = request.headers.origin;

    // No Origin header means a non-browser client (curl, mobile SDK, server-to-server).
    // These are not susceptible to CSRF, so we allow them through.
    if (!requestOrigin) return;

    if (requestOrigin !== allowedOrigin) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN_ORIGIN', message: 'Request origin not permitted' },
      });
    }
  });
}

export const originCheckPlugin = fp(originCheck, { name: 'origin-check-plugin' });
