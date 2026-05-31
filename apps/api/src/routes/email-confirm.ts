import type { FastifyInstance } from 'fastify';
import { ConfirmEmailChangeUseCase } from '@asciidocollab/domain';
import type { AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

export async function emailConfirmRoute(app: FastifyInstance): Promise<void> {
  app.get('/auth/email/confirm', {
    config: {
      rateLimit: {
        max: app.config.auth.emailConfirm.rateLimitMax,
        timeWindow: app.config.auth.emailConfirm.rateLimitWindow,
      },
    },
    schema: {
      querystring: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { token } = request.query as { token: string };

    const useCase = new ConfirmEmailChangeUseCase(
      request.server.repos.emailChangeToken,
      request.server.repos.user,
      request.server.services.tokenGenerator,
    );

    const result = await useCase.execute(token);

    if (!result.success) {
      return reply.status(400).send({
        error: { code: 'INVALID_TOKEN', message: result.error.message },
      } satisfies AuthErrorResponseDto);
    }

    return reply.status(200).send({
      message: 'Email address updated successfully',
    } satisfies AuthSuccessResponseDto);
  });
}
