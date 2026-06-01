import type { FastifyInstance } from 'fastify';
import { VerifyEmailUseCase } from '@asciidocollab/domain';
import '../types/session';

/** Registers the verify email route on the Fastify instance. */
export async function verifyEmailRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { token?: string } }>('/auth/verify-email', {
    config: {
      rateLimit: {
        max: app.config.auth.emailVerification.rateLimitMax,
        timeWindow: app.config.auth.emailVerification.rateLimitWindow,
      },
    },
  }, async (request, reply) => {
    const { token } = request.query;
    if (!token) {
      return reply.status(400).send({ error: { code: 'INVALID_TOKEN', message: 'Token is required' } });
    }

    const useCase = new VerifyEmailUseCase(
      request.server.repos.user,
      request.server.repos.emailVerificationToken,
      request.server.repos.auditLog,
      request.server.services.tokenGenerator,
    );

    const result = await useCase.execute(token);

    if (!result.success) {
      return reply.status(400).send({ error: { code: 'INVALID_TOKEN', message: result.error.message } });
    }

    // Only upgrade the session if the user is already authenticated as the same account.
    // Never create a new session from a token alone — that would allow anyone who
    // intercepts the verification link to log in without a password.
    if (request.session.userId === result.value.userId.value) {
      request.session.emailVerified = true;
    }

    return reply.status(200).send({ message: 'Email verified' });
  });
}
