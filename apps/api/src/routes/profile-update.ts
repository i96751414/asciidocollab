import type { FastifyInstance } from 'fastify';
import { UserId, UpdateDisplayNameUseCase } from '@asciidocollab/domain';
import '../types/session';
import type { UpdateDisplayNameDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/** Registers the profile update route on the Fastify instance. */
export async function profileUpdateRoute(app: FastifyInstance): Promise<void> {
  app.patch<{ Body: UpdateDisplayNameDto }>('/auth/profile', {
    config: {
      rateLimit: {
        max: app.config.auth.profileUpdate.rateLimitMax,
        timeWindow: app.config.auth.profileUpdate.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['displayName'],
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      } satisfies AuthErrorResponseDto);
    }

    const { displayName } = request.body;

    const useCase = new UpdateDisplayNameUseCase(request.server.repos.user);
    const result = await useCase.execute(UserId.create(request.session.userId), displayName);

    if (!result.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: result.error.message },
      } satisfies AuthErrorResponseDto);
    }

    return reply.status(200).send({ message: 'Profile updated' } satisfies AuthSuccessResponseDto);
  });
}
