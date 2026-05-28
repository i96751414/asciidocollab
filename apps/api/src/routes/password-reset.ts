import type { FastifyInstance } from 'fastify';
import { ResetPasswordUseCase } from '@asciidocollab/domain';
import { hashPassword, verifyPassword } from '../services/auth.service';
import { validatePassword, getPasswordPolicy } from '../services/validation';
import { hashToken } from '../services/password-reset.service';
import type { ResetPasswordDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/**
 * Registers the password reset route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function passwordResetRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/password/reset', {
    config: {
      rateLimit: {
        max: parseInt(process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX ?? '3', 10),
        timeWindow: parseInt(process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW ?? '3600000', 10),
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
    const { token, newPassword } = request.body as ResetPasswordDto;

    const validationError = validatePassword(newPassword, getPasswordPolicy());
    if (validationError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: validationError },
      } satisfies AuthErrorResponseDto);
    }

    const hashedToken = hashToken(token);
    const historyDepth = parseInt(process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_HISTORY_DEPTH ?? '5', 10);
    const newPasswordHash = await hashPassword(newPassword);

    const useCase = new ResetPasswordUseCase(
      request.server.repos.user,
      request.server.repos.passwordResetToken,
      verifyPassword,
      hashPassword,
    );

    const result = await useCase.execute(hashedToken, newPasswordHash, historyDepth);

    if (!result.success) {
      const code = result.error.name === 'InvalidTokenError' ? 'INVALID_TOKEN' : 'PASSWORD_REUSE';
      return reply.status(400).send({
        error: { code, message: result.error.message },
      } satisfies AuthErrorResponseDto);
    }

    return reply.status(200).send({ message: 'Password reset successfully' } satisfies AuthSuccessResponseDto);
  });
}
