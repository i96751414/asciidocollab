import type { FastifyInstance } from 'fastify';
import { Email, SendUserInvitationUseCase, UserId } from '@asciidocollab/domain';
import type { AdminInviteUserDto } from '@asciidocollab/shared';
import { requireAuth } from '../../plugins/require-auth';
import { requireAdmin } from '../../plugins/require-admin';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import '../../types/session';

/** Registers the admin user invite route on the Fastify instance. */
export async function usersInviteRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: AdminInviteUserDto }>('/admin/users/invite', {
    config: {
      rateLimit: {
        max: app.config.admin.invite.rateLimitMax,
        timeWindow: app.config.admin.invite.rateLimitWindow,
      },
    },
    preHandler: [requireAuth, requireAdmin],
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
    const { email } = request.body;
    const actorId = UserId.create(getAuthenticatedUserId(request));

    const actor = await request.server.repos.user.findById(actorId);
    const actorDisplayName = actor?.displayName ?? 'Administrator';

    const useCase = new SendUserInvitationUseCase(
      request.server.repos.user,
      request.server.repos.userInvitation,
      request.server.repos.auditLog,
      request.server.services.tokenGenerator,
      request.server.services.registrationInvitationNotifier,
    );

    const result = await useCase.execute(actorId, Email.create(email), actorDisplayName);

    if (!result.success) {
      const code = result.error.name === 'DuplicateEmailError' ? 'DUPLICATE_EMAIL'
        : (result.error.name === 'InvitationAlreadyPendingError' ? 'INVITATION_ALREADY_PENDING'
        : 'PERMISSION_DENIED');
      const status = result.error.name === 'PermissionDeniedError' ? 403 : 409;
      return reply.status(status).send({ error: { code, message: result.error.message } });
    }

    return reply.status(202).send({ message: 'Invitation sent' });
  });
}
