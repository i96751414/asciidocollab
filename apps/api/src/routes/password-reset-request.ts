import type { FastifyInstance } from 'fastify';
import { PrismaUserRepository } from '@asciidocollab/infrastructure';
import { Email } from '@asciidocollab/domain';
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
        max: parseInt(process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX ?? '3', 10),
        timeWindow: parseInt(process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW ?? '3600000', 10),
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

    const userRepo = new PrismaUserRepository(app.prisma);
    const user = await userRepo.findByEmail(Email.create(email));

    if (user) {
      const resetToken = generatePasswordResetToken();

      await app.prisma.passwordResetToken.create({
        data: {
          userId: user.id.value,
          tokenHash: resetToken.hashedToken,
          expiresAt: resetToken.expiresAt,
        },
      });

      // TODO: fix URL in email
      await sendEmail({
        to: email,
        subject: 'Password Reset Request',
        html: `Click <a href="${process.env.ASCIIDOCOLLAB_API_FRONTEND_URL ?? 'https://asciidocollab.example.com'}/reset?token=${resetToken.token}">here</a> to reset your password.`,
      });
    }

    return reply.status(200).send({ message: 'If the email exists, a reset link has been sent' } satisfies AuthSuccessResponseDto);
  });
}
