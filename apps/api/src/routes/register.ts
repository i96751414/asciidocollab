import type { FastifyInstance } from 'fastify';
import { Email, RegisterUserUseCase } from '@asciidocollab/domain';
import { hashPassword } from '../services/auth.service';
import { validatePassword, validateEmail, getPasswordPolicy } from '../services/validation';
import { isCommonPassword } from '../services/blocklist';
import { isPasswordBreached } from '../services/breach-check.service';
import { sendEmail } from '../services/email.service';
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
        max: parseInt(process.env.ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_MAX ?? '3', 10),
        timeWindow: parseInt(process.env.ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_WINDOW ?? '3600000', 10),
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

    const emailError = validateEmail(email);
    if (emailError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: emailError },
      } satisfies AuthErrorResponseDto);
    }

    const policy = getPasswordPolicy();
    const passwordError = validatePassword(password, policy);
    if (passwordError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: passwordError },
      } satisfies AuthErrorResponseDto);
    }

    if (isCommonPassword(password)) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Password is too common' },
      } satisfies AuthErrorResponseDto);
    }

    const breached = await isPasswordBreached(password);
    const passwordHash = await hashPassword(password);

    const useCase = new RegisterUserUseCase(request.server.repos.user);
    const result = await useCase.execute(
      Email.create(email),
      displayName,
      passwordHash,
      breached,
    );

    if (!result.success) {
      return reply.status(400).send({
        error: { code: 'REGISTRATION_FAILED', message: result.error.message },
      } satisfies AuthErrorResponseDto);
    }

    if (breached) {
      await sendEmail({
        to: email,
        subject: 'Security Alert: Password Breach Detected',
        html: `<p>Your password has been found in a data breach. Please change your password immediately.</p>`,
      });
    }

    return reply.status(201).send({ message: 'Account created' } satisfies AuthSuccessResponseDto);
  });
}
