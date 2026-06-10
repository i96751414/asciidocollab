import type { FastifyInstance } from 'fastify';
import { UserId } from '@asciidocollab/domain';
import '../../types/session';
import type { UserProfileDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/** Registers the me route on the Fastify instance. */
export async function meRoute(app: FastifyInstance): Promise<void> {
  app.get('/auth/me', async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      } satisfies AuthErrorResponseDto);
    }

    const user = await request.server.repos.user.findById(
      UserId.create(request.session.userId),
    );

    if (!user) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      } satisfies AuthErrorResponseDto);
    }

    return {
      userId: user.id.value,
      displayName: user.displayName,
      email: user.email.value,
      isAdmin: user.isAdmin,
      emailVerified: user.emailVerified,
      avatarKey: user.avatarKey ?? null,
      appTheme: user.appTheme ?? 'system',
    } satisfies UserProfileDto;
  });
}
