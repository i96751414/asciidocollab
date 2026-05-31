import type { FastifyInstance } from 'fastify';
import { UserId, RequestEmailChangeUseCase } from '@asciidocollab/domain';
import '../types/session';
import type { RequestEmailChangeDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

export async function emailChangeRequestRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/email/change-request', {
    config: {
      rateLimit: {
        max: app.config.auth.passwordReset.rateLimitMax,
        timeWindow: app.config.auth.passwordReset.rateLimitWindow,
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
    );

    const result = await useCase.execute(UserId.create(request.session.userId), newEmail);

    if (result.success && result.value.rawToken) {
      const frontendUrl = app.config.api.frontendUrl;
      try {
        await request.server.services.emailSender.send(
          newEmail,
          'Confirm your email address change',
          `Click to confirm: ${frontendUrl}/email-confirm?token=${result.value.rawToken}`,
        );
      } catch (error) {
        request.log.error({ err: error }, 'Failed to send email change confirmation email');
      }
    }

    return reply.status(200).send({
      message: 'If the address is available, a confirmation link has been sent',
    } satisfies AuthSuccessResponseDto);
  });
}
