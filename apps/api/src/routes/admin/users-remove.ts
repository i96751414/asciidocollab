import type { FastifyInstance } from 'fastify';
import { RemoveUserUseCase, UserId } from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../../plugins/require-auth';
import { requireAdmin } from '../../plugins/require-admin';
import '../../types/session';

/** Registers the admin user removal route on the Fastify instance. */
export async function usersRemoveRoute(app: FastifyInstance): Promise<void> {
  app.delete<{ Params: { id: string } }>('/admin/users/:id', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const actorId = UserId.create(getAuthenticatedUserId(request));
    const targetId = UserId.create(request.params.id);

    const useCase = new RemoveUserUseCase(
      request.server.repos.user,
      request.server.repos.projectMember,
      request.server.repos.session,
      request.server.repos.auditLog,
    );
    const result = await useCase.execute(actorId, targetId);

    if (!result.success) {
      const errorCodes: Record<string, string> = {
        CannotRemoveSelfError: 'CANNOT_REMOVE_SELF',
        CannotRemoveLastAdminError: 'CANNOT_REMOVE_LAST_ADMIN',
        UserNotFoundError: 'NOT_FOUND',
      };
      const code = errorCodes[result.error.name] ?? 'PERMISSION_DENIED';
      const status = code === 'NOT_FOUND' ? 404 : 403;
      return reply.status(status).send({ error: { code, message: result.error.message } });
    }

    return reply.status(200).send({
      message: 'User removed',
      projectsTransferred: result.value.projectIdsTransferred,
    });
  });
}
