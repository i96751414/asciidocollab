import type { FastifyInstance } from 'fastify';
import { PrismaUserRepository } from '@asciidocollab/infrastructure';
import { UserId, User } from '@asciidocollab/domain';
import { hashPassword, verifyPassword } from '../services/auth.service';
import { validatePassword, getPasswordPolicy } from '../services/validation';
import { sendEmail } from '../services/email.service';
import '../types/session';
import type { ChangePasswordDto, AuthSuccessResponseDto, AuthErrorResponseDto } from '@asciidocollab/shared';

/**
 * Registers the password change route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function passwordChangeRoute(app: FastifyInstance): Promise<void> {
  app.post('/auth/password/change', {
    config: {
      rateLimit: {
        max: parseInt(process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_MAX ?? '5', 10),
        timeWindow: parseInt(process.env.ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_WINDOW ?? '900000', 10),
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      } satisfies AuthErrorResponseDto);
    }

    const { currentPassword, newPassword } = request.body as ChangePasswordDto;

    const validationError = validatePassword(newPassword, getPasswordPolicy());
    if (validationError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: validationError },
      } satisfies AuthErrorResponseDto);
    }

    const userRepo = new PrismaUserRepository(app.prisma);
    const user = await userRepo.findById(UserId.create(request.session.userId));
    if (!user || !user.passwordHash) {
      return reply.status(400).send({
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
      } satisfies AuthErrorResponseDto);
    }

    const currentPasswordValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!currentPasswordValid) {
      return reply.status(400).send({
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
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

    await sendEmail({
      to: user.email.value,
      subject: 'Password Changed',
      html: `<p>Your password has been changed. If you did not make this change, please contact support immediately.</p>`,
    });

    return reply.status(200).send({ message: 'Password changed' } satisfies AuthSuccessResponseDto);
  });
}
