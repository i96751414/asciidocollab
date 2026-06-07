import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

function extractRetryAfterSeconds(error: FastifyError | Error): number {
  if (!('headers' in error)) return 60;
  const { headers } = error;
  if (typeof headers !== 'object' || headers === null) return 60;
  if (!('retry-after' in headers)) return 60;
  const raw = Number(headers['retry-after']);
  return Number.isFinite(raw) && raw > 0 ? raw : 60;
}

/**
 * Global error handler for unhandled errors in routes.
 *
 * @param error - The error that occurred.
 * @param request - The incoming request.
 * @param reply - Fastify reply used to send the formatted error response.
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  request.log.error({ err: error, statusCode }, 'Unhandled error in route');

  if (statusCode === 429) {
    const retryAfter = extractRetryAfterSeconds(error);
    reply.status(429).send({
      error: { code: 'RATE_LIMITED', message: 'Too many requests', retryAfter },
    });
    return;
  }

  reply.status(statusCode).send({
    error: {
      code: statusCode === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

/**
 * Handler for requests to non-existent routes.
 *
 * @param _request - The incoming request (unused).
 * @param reply - Fastify reply used to send the 404 response.
 */
export function notFoundHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  reply.status(404).send({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
}
