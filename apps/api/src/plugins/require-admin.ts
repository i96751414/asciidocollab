import type { FastifyRequest, FastifyReply } from 'fastify';
import '../types/session';

/** Fastify preHandler that rejects requests from users without administrator privileges. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.session.isAdmin) {
    return reply.status(403).send({
      error: { code: 'PERMISSION_DENIED', message: 'Administrator access required' },
    });
  }
}
