import type { FastifyInstance } from 'fastify';
import { ResendVerificationEmailUseCase, UserId } from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../plugins/require-auth';
import '../types/session';

/** Registers the resend verification route on the Fastify instance. */
export async function resendVerificationRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/resend-verification', {
    config: {
      rateLimit: {
        max: app.config.auth.emailVerification.rateLimitMax,
        timeWindow: app.config.auth.emailVerification.rateLimitWindow,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const userId = UserId.create(getAuthenticatedUserId(request));

    const useCase = new ResendVerificationEmailUseCase(
      request.server.repos.user,
      request.server.repos.emailVerificationToken,
      request.server.services.tokenGenerator,
      request.server.services.emailVerificationNotifier,
    );

    await useCase.execute(userId);

    return reply.status(202).send({ message: 'Verification email sent' });
  });
}
