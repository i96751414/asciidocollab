import type { FastifyInstance } from 'fastify';
import { Email, LoginUseCase } from '@asciidocollab/domain';
import { verifyPassword } from '../services/auth.service';
import '../types/session';
import type { LoginDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/**
 * Registers the login route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function loginRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', {
    config: {
      rateLimit: {
        max: app.config.auth.login.rateLimitMax,
        timeWindow: app.config.auth.login.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as LoginDto;

    const useCase = new LoginUseCase(request.server.repos.user, verifyPassword);
    const result = await useCase.execute(Email.create(email), password);

    if (!result.success) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      } satisfies AuthErrorResponseDto);
    }

    request.session.userId = result.value.userId;

    return reply.status(200).send({ message: 'Authenticated' } satisfies AuthSuccessResponseDto);
  });
}
