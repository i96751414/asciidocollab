import type { FastifyRequest, FastifyReply } from 'fastify';
import '../types/session';

/**
 * Fastify preHandler that rejects unauthenticated requests with 401.
 * Guaranteed to run before any protected route handler.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.session.userId) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
}

/**
 * Returns the session userId as a non-optional string.
 *
 * Call this inside any handler registered under `protectedRoutes` — `requireAuth`
 * guarantees the value is set before the handler runs. If called outside that
 * scope (a programming error), an invariant error is thrown rather than silently
 * returning undefined.
 */
export function getAuthenticatedUserId(request: FastifyRequest): string {
  const { userId } = request.session;
  if (!userId) {
    throw new Error('Invariant: getAuthenticatedUserId called outside authenticated scope');
  }
  return userId;
}
