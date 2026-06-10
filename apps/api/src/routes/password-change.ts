import type { FastifyInstance } from 'fastify';
import { UserId, ChangePasswordUseCase } from '@asciidocollab/domain';
import { buildPasswordPolicy } from '../services/password-policy';
import { requestContextFrom } from '../lib/request-context';
import { requestLogger } from '../lib/request-logger';
import '../types/session';
import type { ChangePasswordDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/**
 * Registers the password change route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function passwordChangeRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ChangePasswordDto }>('/auth/password/change', {
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

    const { currentPassword, newPassword } = request.body;

    const historyDepth = app.config.auth.password.historyDepth;

    const useCase = new ChangePasswordUseCase(
      request.server.repos.user,
      request.server.services.passwordHasher,
      buildPasswordPolicy(),
      request.server.services.breachChecker,
      request.server.repos.auditLog,
      requestLogger(request),
    );

    const result = await useCase.execute(
      UserId.create(request.session.userId),
      currentPassword,
      newPassword,
      historyDepth,
      requestContextFrom(request),
    );

    if (!result.success) {
      let code: string;
      switch (result.error.name) {
        case 'ValidationError': {
          code = 'VALIDATION_ERROR';
          break;
        }
        case 'InvalidPasswordError': {
          code = 'INVALID_PASSWORD';
          break;
        }
        case 'PasswordReuseError': {
          code = 'PASSWORD_REUSE';
          break;
        }
        default: {
          code = 'VALIDATION_ERROR';
          break;
        }
      }
      return reply.status(400).send({
        error: { code, message: result.error.message },
      } satisfies AuthErrorResponseDto);
    }

    const user = await request.server.repos.user.findById(UserId.create(request.session.userId));
    if (user) {
      await request.server.services.emailSender.send(
        user.email.value,
        request.server.config.auth.email.templates.passwordChanged.subject,
        request.server.config.auth.email.templates.passwordChanged.html,
      );
    }

    return reply.status(200).send({ message: 'Password changed' } satisfies AuthSuccessResponseDto);
  });
}
