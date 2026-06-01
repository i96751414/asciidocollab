import type { FastifyInstance } from 'fastify';
import { GetOpenRegistrationUseCase, SetOpenRegistrationUseCase, UserId } from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../../plugins/require-auth';
import { requireAdmin } from '../../plugins/require-admin';
import '../../types/session';

/** Registers the admin settings route on the Fastify instance. */
export async function adminSettingsRoute(app: FastifyInstance): Promise<void> {
  app.get('/admin/settings', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const useCase = new GetOpenRegistrationUseCase(request.server.repos.systemSetting);
    const { enabled } = await useCase.execute();
    return reply.status(200).send({ openRegistration: enabled });
  });

  app.patch<{ Body: { openRegistration?: boolean } }>('/admin/settings', {
    preHandler: [requireAuth, requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: { openRegistration: { type: 'boolean' } },
      },
    },
  }, async (request, reply) => {
    const actorId = UserId.create(getAuthenticatedUserId(request));
    const { openRegistration } = request.body;

    if (openRegistration !== undefined) {
      const setUseCase = new SetOpenRegistrationUseCase(
        request.server.repos.systemSetting,
        request.server.repos.user,
        request.server.repos.auditLog,
      );
      const result = await setUseCase.execute(actorId, openRegistration);
      if (!result.success) {
        return reply.status(403).send({ error: { code: 'PERMISSION_DENIED', message: result.error.message } });
      }
    }

    const getUseCase = new GetOpenRegistrationUseCase(request.server.repos.systemSetting);
    const { enabled } = await getUseCase.execute();
    return reply.status(200).send({ openRegistration: enabled });
  });
}
