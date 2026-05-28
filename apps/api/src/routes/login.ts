import type { FastifyInstance } from 'fastify';
import { PrismaUserRepository } from '@asciidocollab/infrastructure';
import { Email } from '@asciidocollab/domain';
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
        max: parseInt(process.env.ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_MAX ?? '5', 10),
        timeWindow: parseInt(process.env.ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_WINDOW ?? '900000', 10),
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

    const userRepo = new PrismaUserRepository(app.prisma);
    const user = await userRepo.findByEmail(Email.create(email));

    if (!user || !user.passwordHash) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      } satisfies AuthErrorResponseDto);
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      } satisfies AuthErrorResponseDto);
    }

    request.session.userId = user.id.value;

    return reply.status(200).send({ message: 'Authenticated' } satisfies AuthSuccessResponseDto);
  });
}
