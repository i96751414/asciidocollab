import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Global error handler for unhandled errors in routes.
 *
 * @param error - The error that occurred.
 * @param request - The incoming request.
 * @param reply - The reply object.
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  request.log.error({ err: { type: error.constructor.name, statusCode } }, 'Unhandled error in route');
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
 * @param reply - The reply object.
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
