import type { FastifyInstance } from 'fastify';
import type { AuthSuccessResponseDto } from '@asciidocollab/shared';

/**
 * Registers the logout route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function logoutRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/logout', async (request, reply) => {
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });

    reply.clearCookie('sessionId');
    return reply.status(200).send({ message: 'Logged out' } satisfies AuthSuccessResponseDto);
  });
}
