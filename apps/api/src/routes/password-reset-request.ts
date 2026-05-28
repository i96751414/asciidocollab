import type { FastifyInstance } from 'fastify';
import { Email, RequestPasswordResetUseCase } from '@asciidocollab/domain';
import { generatePasswordResetToken } from '../services/password-reset.service';
import { sendEmail } from '../services/email.service';
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

    const useCase = new RequestPasswordResetUseCase(
      request.server.repos.user,
      request.server.repos.passwordResetToken,
      generatePasswordResetToken,
    );

    const result = await useCase.execute(Email.create(email));

    if (result.success) {
      const frontendUrl = app.config.api.frontendUrl;
      const template = app.config.auth.email.templates.resetRequest;
      await sendEmail({
        to: result.value.email,
        subject: template.subject,
        html: template.html.replace('{frontendUrl}', frontendUrl).replace('{token}', result.value.rawToken),
      });
    }

    return reply.status(200).send({ message: 'If the email exists, a reset link has been sent' } satisfies AuthSuccessResponseDto);
  });
}
