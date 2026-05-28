import type { FastifyInstance } from 'fastify';
import { PrismaUserRepository } from '@asciidocollab/infrastructure';
import { UserId, User } from '@asciidocollab/domain';
import { hashPassword, verifyPassword } from '../services/auth.service';
import { validatePassword, getPasswordPolicy } from '../services/validation';
import { hashToken } from '../services/password-reset.service';
import type { ResetPasswordDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/**
 * Registers the password reset route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function passwordResetRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/password/reset', {
    config: {
      rateLimit: {
        max: parseInt(process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX ?? '3', 10),
        timeWindow: parseInt(process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW ?? '3600000', 10),
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { token, newPassword } = request.body as ResetPasswordDto;

    const validationError = validatePassword(newPassword, getPasswordPolicy());
    if (validationError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: validationError },
      } satisfies AuthErrorResponseDto);
    }

    const hashedToken = hashToken(token);

    const resetToken = await app.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashedToken,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetToken) {
      return reply.status(400).send({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' },
      } satisfies AuthErrorResponseDto);
    }

    const userRepo = new PrismaUserRepository(app.prisma);
    const user = await userRepo.findById(UserId.create(resetToken.userId));

    if (!user || !user.passwordHash) {
      return reply.status(400).send({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' },
      } satisfies AuthErrorResponseDto);
    }

    const isReused = await Promise.all(
      user.passwordHistory.map((hash) => verifyPassword(hash, newPassword))
    );
    if (isReused.some(Boolean)) {
      return reply.status(400).send({
        error: { code: 'PASSWORD_REUSE', message: 'Cannot reuse recent passwords' },
      } satisfies AuthErrorResponseDto);
    }

    const newHash = await hashPassword(newPassword);
    const historyDepth = parseInt(process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_HISTORY_DEPTH ?? '5', 10);
    const updatedHistory = [...user.passwordHistory, user.passwordHash].slice(-historyDepth);

    const updatedUser = new User(
      user.id,
      user.email,
      user.displayName,
      newHash,
      updatedHistory,
      user.samlSubject,
      user.mfaSecret,
      user.timestamps,
    );
    await userRepo.save(updatedUser);

    await app.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    return reply.status(200).send({ message: 'Password reset successfully' } satisfies AuthSuccessResponseDto);
  });
}
