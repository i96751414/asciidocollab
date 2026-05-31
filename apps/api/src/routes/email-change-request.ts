import type { FastifyInstance } from 'fastify';
import { UserId, RequestEmailChangeUseCase, NotificationDeliveryError } from '@asciidocollab/domain';
import '../types/session';
import type { RequestEmailChangeDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

export async function emailChangeRequestRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/email/change-request', {
    config: {
      rateLimit: {
        max: app.config.auth.emailChangeRequest.rateLimitMax,
        timeWindow: app.config.auth.emailChangeRequest.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['newEmail'],
        properties: {
          newEmail: { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      } satisfies AuthErrorResponseDto);
    }

    const { newEmail } = request.body as RequestEmailChangeDto;

    const useCase = new RequestEmailChangeUseCase(
      request.server.repos.user,
      request.server.repos.emailChangeToken,
      request.server.services.tokenGenerator,
      request.server.services.emailChangeNotifier,
    );

    try {
      await useCase.execute(UserId.create(request.session.userId), newEmail);
    } catch (error) {
      if (!(error instanceof NotificationDeliveryError)) throw error;
      request.log.warn({ err: error }, 'email change confirmation delivery failed');
    }

    return reply.status(200).send({
      message: 'If the address is available, a confirmation link has been sent',
    } satisfies AuthSuccessResponseDto);
  });
}
