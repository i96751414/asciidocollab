import type { FastifyRequest, FastifyReply } from 'fastify';
import '../types/session';

/**
 * Fastify preHandler that rejects unauthenticated requests with 401.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.session.userId) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
}
