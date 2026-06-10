import type { FastifyInstance } from 'fastify';
import { ResetPasswordUseCase } from '@asciidocollab/domain';
import { buildPasswordPolicy } from '../services/password-policy';
import { requestContextFrom } from '../lib/request-context';
import { requestLogger } from '../lib/request-logger';
import type { ResetPasswordDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/**
 * Registers the password reset route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function passwordResetRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ResetPasswordDto }>('/auth/password/reset', {
    config: {
      rateLimit: {
        max: app.config.auth.passwordReset.rateLimitMax,
        timeWindow: app.config.auth.passwordReset.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { token, newPassword } = request.body;

    const historyDepth = app.config.auth.password.historyDepth;

    const useCase = new ResetPasswordUseCase(
      request.server.repos.user,
      request.server.repos.passwordResetToken,
      request.server.services.passwordHasher,
      request.server.services.tokenGenerator,
      buildPasswordPolicy(),
      request.server.repos.auditLog,
      requestLogger(request),
    );

    const result = await useCase.execute(token, newPassword, historyDepth, requestContextFrom(request));

    if (!result.success) {
      let code: string;
      if (result.error.name === 'ValidationError') {
        code = 'VALIDATION_ERROR';
      } else if (result.error.name === 'InvalidTokenError') {
        code = 'INVALID_TOKEN';
      } else {
        code = 'PASSWORD_REUSE';
      }
      return reply.status(400).send({
        error: { code, message: result.error.message },
      } satisfies AuthErrorResponseDto);
    }

    return reply.status(200).send({ message: 'Password reset successfully' } satisfies AuthSuccessResponseDto);
  });
}
