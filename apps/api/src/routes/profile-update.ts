import type { FastifyInstance } from 'fastify';
import { UserId, UpdateDisplayNameUseCase } from '@asciidocollab/domain';
import '../types/session';
import type { UpdateDisplayNameDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

export async function profileUpdateRoute(app: FastifyInstance): Promise<void> {
  app.patch('/auth/profile', {
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

    const { displayName } = request.body as UpdateDisplayNameDto;

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
