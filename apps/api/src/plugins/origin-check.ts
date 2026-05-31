import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const PLACEHOLDER_URL = 'https://asciidocollab.example.com';

async function originCheck(app: FastifyInstance): Promise<void> {
  const allowedOrigin =
    app.config?.api?.frontendUrl ??
    process.env.ASCIIDOCOLLAB_API_FRONTEND_URL ??
    process.env.FRONTEND_URL;

  const isProduction = app.config?.env === 'production';
  const unconfigured = !allowedOrigin || allowedOrigin === PLACEHOLDER_URL;

  if (unconfigured) {
    if (isProduction) {
      throw new Error(
        'origin-check: ASCIIDOCOLLAB_API_FRONTEND_URL must be set in production. ' +
        'Set it to your frontend origin (e.g. https://app.example.com).',
      );
    }
    app.log.warn(
      'origin-check: CSRF enforcement disabled — set ASCIIDOCOLLAB_API_FRONTEND_URL to enable.',
    );
    return;
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
