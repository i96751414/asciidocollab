import type { FastifyInstance } from 'fastify';
import { SetAdminStatusUseCase, UserId } from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../../plugins/require-auth';
import { requireAdmin } from '../../plugins/require-admin';
import '../../types/session';

/** Registers the admin user status route on the Fastify instance. */
export async function usersAdminStatusRoute(app: FastifyInstance): Promise<void> {
  app.patch<{ Params: { id: string }; Body: { isAdmin: boolean } }>('/admin/users/:id/admin', {
    preHandler: [requireAuth, requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['isAdmin'],
        properties: { isAdmin: { type: 'boolean' } },
      },
    },
  }, async (request, reply) => {
    const actorId = UserId.create(getAuthenticatedUserId(request));
    const targetId = UserId.create(request.params.id);
    const { isAdmin } = request.body;

    const useCase = new SetAdminStatusUseCase(request.server.repos.user, request.server.repos.auditLog, request.server.repos.session);
    const result = await useCase.execute(actorId, targetId, isAdmin);

    if (!result.success) {
      const errorCodes: Record<string, string> = {
        CannotModifySelfAdminError: 'CANNOT_MODIFY_SELF',
        CannotRemoveLastAdminError: 'CANNOT_REMOVE_LAST_ADMIN',
        UserNotFoundError: 'NOT_FOUND',
      };
      const code = errorCodes[result.error.name] ?? 'PERMISSION_DENIED';
      const status = code === 'NOT_FOUND' ? 404 : 403;
      return reply.status(status).send({ error: { code, message: result.error.message } });
    }

    return reply.status(200).send({ message: 'Admin status updated' });
  });
}
