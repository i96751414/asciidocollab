import type { FastifyInstance } from 'fastify';
import { ListUsersUseCase, UserId } from '@asciidocollab/domain';
import type { AdminUserDto } from '@asciidocollab/shared';
import { requireAuth, getAuthenticatedUserId } from '../../plugins/require-auth';
import { requireAdmin } from '../../plugins/require-admin';
import '../../types/session';

/** Registers the admin users route on the Fastify instance. */
export async function usersRoute(app: FastifyInstance): Promise<void> {
  app.get('/admin/users', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const actorId = UserId.create(getAuthenticatedUserId(request));
    const useCase = new ListUsersUseCase(request.server.repos.user);
    const result = await useCase.execute(actorId);

    if (!result.success) {
      return reply.status(403).send({ error: { code: 'PERMISSION_DENIED', message: result.error.message } });
    }

    const users: AdminUserDto[] = result.value.users.map((u) => ({
      id: u.id.value,
      email: u.email.value,
      displayName: u.displayName,
      isAdmin: u.isAdmin,
      emailVerified: u.emailVerified,
      registrationMethod: u.registrationMethod,
      createdAt: u.createdAt.toISOString(),
    }));

    return reply.status(200).send({ users });
  });

  app.get<{ Params: { id: string } }>('/admin/users/:id/removal-preview', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const targetId = UserId.create(request.params.id);
    const projectsToTransfer = await request.server.repos.projectMember.findSoleOwnerProjects(targetId);

    return reply.status(200).send({
      projectsToTransfer: projectsToTransfer.map((p) => ({ id: p.id.value, name: p.name })),
    });
  });
}
