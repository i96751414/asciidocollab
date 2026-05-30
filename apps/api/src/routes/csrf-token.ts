import type { FastifyInstance } from 'fastify';

export async function csrfTokenRoute(app: FastifyInstance): Promise<void> {
  app.get('/auth/csrf-token', async (_request, reply) => {
    const token = await reply.generateCsrf();
    return reply.status(200).send({ token });
  });
}
