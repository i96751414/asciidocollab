import type { FastifyInstance } from 'fastify';
import { Email, RegisterUserUseCase } from '@asciidocollab/domain';
import { hashPassword } from '../services/auth.service';
import { isCommonPassword } from '../services/blocklist';
import { isPasswordBreached } from '../services/breach-check.service';
import { sendEmail } from '../services/email.service';
import { buildPasswordPolicy } from '../services/password-policy';
import type { RegisterDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/**
 * Registers the user registration route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function registerRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', {
    config: {
      rateLimit: {
        max: app.config.auth.registration.rateLimitMax,
        timeWindow: app.config.auth.registration.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'displayName'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 1 },
          displayName: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, displayName } = request.body as RegisterDto;

    const useCase = new RegisterUserUseCase(
      request.server.repos.user,
      buildPasswordPolicy(),
      isCommonPassword,
      isPasswordBreached,
      hashPassword,
    );

    const result = await useCase.execute(Email.create(email), displayName, password);

    if (!result.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: result.error.message },
      } satisfies AuthErrorResponseDto);
    }

    if (result.value.breached) {
      await sendEmail({
        to: email,
        subject: app.config.auth.email.templates.breachAlert.subject,
        html: app.config.auth.email.templates.breachAlert.html,
      });
    }

    const status = result.value.existing ? 200 : 201;
    return reply.status(status).send({ message: 'Account created' } satisfies AuthSuccessResponseDto);
  });
}
