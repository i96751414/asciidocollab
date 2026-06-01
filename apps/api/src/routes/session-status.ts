import type { FastifyInstance } from 'fastify';
import '../types/session';

/** Registers the session status route on the Fastify instance. */
export async function sessionStatusRoute(app: FastifyInstance): Promise<void> {
  app.get('/auth/session-status', async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(200).send({ authenticated: false });
    }

    return reply.status(200).send({
      authenticated: true,
      emailVerified: request.session.emailVerified ?? false,
      isAdmin: request.session.isAdmin ?? false,
    });
  });
}
