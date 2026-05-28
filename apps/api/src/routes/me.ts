import type { FastifyInstance } from 'fastify';
import '../types/session';
import type { UserProfileDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/**
 * Registers the user profile route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function meRoute(app: FastifyInstance): Promise<void> {
  app.get('/auth/me', async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      } satisfies AuthErrorResponseDto);
    }
    return { userId: request.session.userId } satisfies UserProfileDto;
  });
}
