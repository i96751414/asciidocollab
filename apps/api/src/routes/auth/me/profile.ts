import type { FastifyInstance } from 'fastify';
import { UserId, UpdateProfileUseCase } from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../../../plugins/require-auth';
import '../../../types/session';
import type { AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

interface UpdateProfileBody {
  displayName?: string;
  appTheme?: string;
  avatarKey?: string | null;
}

/** Registers the profile update route on the Fastify instance. */
export async function profileUpdateRoute(app: FastifyInstance): Promise<void> {
  app.patch<{ Body: UpdateProfileBody }>('/auth/me/profile', {
    preHandler: requireAuth,
    config: {
      rateLimit: {
        max: app.config.auth.profileUpdate.rateLimitMax,
        timeWindow: app.config.auth.profileUpdate.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 100 },
          appTheme: { type: 'string', enum: ['light', 'dark', 'system'] },
          avatarKey: { type: ['string', 'null'], maxLength: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = UserId.create(getAuthenticatedUserId(request));
    const { displayName, appTheme, avatarKey } = request.body;

    const useCase = new UpdateProfileUseCase(request.server.repos.user);
    const result = await useCase.execute({
      userId,
      ...(displayName !== undefined && { displayName }),
      ...(appTheme !== undefined && { appTheme }),
      ...(avatarKey !== undefined && { avatarKey }),
    });

    if (!result.success) {
      const status = result.error.name === 'UserNotFoundError' ? 404 : 400;
      return reply.status(status).send({
        error: { code: result.error.name.toUpperCase().replace('ERROR', '_ERROR'), message: result.error.message },
      } satisfies AuthErrorResponseDto);
    }

    return reply.status(200).send({ message: 'Profile updated' } satisfies AuthSuccessResponseDto);
  });
}
