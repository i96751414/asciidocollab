import type { FastifyInstance } from 'fastify';
import { UserId, ChangePasswordUseCase } from '@asciidocollab/domain';
import { hashPassword, verifyPassword } from '../services/auth.service';
import { sendEmail } from '../services/email.service';
import { buildPasswordPolicy } from '../services/password-policy';
import '../types/session';
import type { ChangePasswordDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/**
 * Registers the password change route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function passwordChangeRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/password/change', {
    config: {
      rateLimit: {
        max: app.config.auth.passwordChange.rateLimitMax,
        timeWindow: app.config.auth.passwordChange.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      } satisfies AuthErrorResponseDto);
    }

    const { currentPassword, newPassword } = request.body as ChangePasswordDto;

    const historyDepth = app.config.auth.password.historyDepth;

    const useCase = new ChangePasswordUseCase(
      request.server.repos.user,
      verifyPassword,
      hashPassword,
      buildPasswordPolicy(),
    );

    const result = await useCase.execute(
      UserId.create(request.session.userId),
      currentPassword,
      newPassword,
      historyDepth,
    );

    if (!result.success) {
      const code = result.error.name === 'ValidationError' ? 'VALIDATION_ERROR'
        : result.error.name === 'InvalidPasswordError' ? 'INVALID_PASSWORD'
        : 'PASSWORD_REUSE';
      return reply.status(400).send({
        error: { code, message: result.error.message },
      } satisfies AuthErrorResponseDto);
    }

    const user = await request.server.repos.user.findById(UserId.create(request.session.userId));
    if (user) {
      await sendEmail({
        to: user.email.value,
        subject: request.server.config.auth.email.templates.passwordChanged.subject,
        html: request.server.config.auth.email.templates.passwordChanged.html,
      });
    }

    return reply.status(200).send({ message: 'Password changed' } satisfies AuthSuccessResponseDto);
  });
}
