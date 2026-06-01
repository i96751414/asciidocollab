import type { FastifyRequest, FastifyReply } from 'fastify';
import '../types/session';

/** Fastify preHandler that rejects requests from users whose email is not yet verified. */
export async function requireEmailVerified(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.session.userId && !request.session.emailVerified) {
    return reply.status(403).send({
      error: { code: 'EMAIL_NOT_VERIFIED', message: 'Email address must be verified to access this resource' },
    });
  }
}
