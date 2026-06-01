import type { FastifyInstance } from 'fastify';
import { Email, RequestPasswordResetUseCase } from '@asciidocollab/domain';
import type { RequestPasswordResetDto, AuthSuccessResponseDto } from '@asciidocollab/shared';

/** Registers the password reset request route on the Fastify instance. */
export async function passwordResetRequestRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RequestPasswordResetDto }>('/auth/password/reset/request', {
    config: {
      rateLimit: {
        max: app.config.auth.passwordReset.rateLimitMax,
        timeWindow: app.config.auth.passwordReset.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    const { email } = request.body;

    const useCase = new RequestPasswordResetUseCase(
      request.server.repos.user,
      request.server.repos.passwordResetToken,
      request.server.services.tokenGenerator,
      request.server.services.passwordResetNotifier,
    );

    await useCase.execute(Email.create(email));

    return reply.status(200).send({ message: 'If the email exists, a reset link has been sent' } satisfies AuthSuccessResponseDto);
  });
}
