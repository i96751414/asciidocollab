import type { FastifyInstance } from 'fastify';
import { Email, RequestPasswordResetUseCase } from '@asciidocollab/domain';
import { requestContextFrom } from '../lib/request-context';
import { requestLogger } from '../lib/request-logger';
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
      {
        repo: request.server.repos.authAttemptTelemetry,
        windowSizeMs: request.server.config.failedSignIn.coalesceWindowMinutes * 60_000,
      },
      requestLogger(request),
    );

    await useCase.execute(Email.create(email), requestContextFrom(request));

    return reply.status(200).send({ message: 'If the email exists, a reset link has been sent' } satisfies AuthSuccessResponseDto);
  });
}
