import type { FastifyInstance } from 'fastify';
import { Email, RequestPasswordResetUseCase } from '@asciidocollab/domain';
import { CryptoTokenGenerator, StubEmailSender } from '@asciidocollab/infrastructure';
import type { RequestPasswordResetDto, AuthSuccessResponseDto } from '@asciidocollab/shared';

/**
 * Registers the password reset request route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function passwordResetRequestRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/password/reset/request', {
    config: {
      rateLimit: {
        max: app.config.auth.passwordReset.rateLimitMax,
        timeWindow: app.config.auth.passwordReset.rateLimitWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    const { email } = request.body as RequestPasswordResetDto;

    const tokenGenerator = new CryptoTokenGenerator({
      tokenByteLength: app.config.auth.passwordReset.tokenByteLength,
      tokenExpiry: app.config.auth.passwordReset.tokenExpiry,
    });

    const emailSender = new StubEmailSender();

    const useCase = new RequestPasswordResetUseCase(
      request.server.repos.user,
      request.server.repos.passwordResetToken,
      tokenGenerator,
    );

    const result = await useCase.execute(Email.create(email));

    if (result.success) {
      const frontendUrl = app.config.api.frontendUrl;
      const template = app.config.auth.email.templates.resetRequest;
      await emailSender.send(
        result.value.email,
        template.subject,
        template.html.replace('{frontendUrl}', frontendUrl).replace('{token}', result.value.rawToken),
      );
    }

    return reply.status(200).send({ message: 'If the email exists, a reset link has been sent' } satisfies AuthSuccessResponseDto);
  });
}
