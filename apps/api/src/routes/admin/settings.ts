import type { FastifyInstance } from 'fastify';
import { GetOpenRegistrationUseCase, SetOpenRegistrationUseCase, UserId } from '@asciidocollab/domain';
import { GetMaxUploadSizeUseCase, SetMaxUploadSizeUseCase } from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../../plugins/require-auth';
import { requireAdmin } from '../../plugins/require-admin';
import '../../types/session';

/** Registers the admin settings route on the Fastify instance. */
export async function adminSettingsRoute(app: FastifyInstance): Promise<void> {
  app.get('/admin/settings', {
    preHandler: [requireAuth, requireAdmin],
  }, async (request, reply) => {
    const openRegUseCase = new GetOpenRegistrationUseCase(request.server.repos.systemSetting);
    const { enabled } = await openRegUseCase.execute();

    const maxUploadUseCase = new GetMaxUploadSizeUseCase(
      request.server.repos.systemSetting,
      request.server.config.storage.maxUploadSizeBytes,
    );
    const { maxUploadSizeBytes } = await maxUploadUseCase.execute();

    return reply.status(200).send({ openRegistration: enabled, maxUploadSizeBytes });
  });

  app.patch<{ Body: { openRegistration?: boolean; maxUploadSizeBytes?: number } }>('/admin/settings', {
    preHandler: [requireAuth, requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          openRegistration: { type: 'boolean' },
          maxUploadSizeBytes: { type: 'integer', minimum: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const actorId = UserId.create(getAuthenticatedUserId(request));
    const { openRegistration, maxUploadSizeBytes } = request.body;

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

    if (maxUploadSizeBytes !== undefined) {
      const setUseCase = new SetMaxUploadSizeUseCase(
        request.server.repos.systemSetting,
        request.server.repos.user,
        request.server.repos.auditLog,
      );
      const result = await setUseCase.execute(actorId, maxUploadSizeBytes);
      if (!result.success) {
        return reply.status(403).send({ error: { code: 'PERMISSION_DENIED', message: result.error.message } });
      }
    }

    const openRegUseCase = new GetOpenRegistrationUseCase(request.server.repos.systemSetting);
    const { enabled } = await openRegUseCase.execute();

    const maxUploadUseCase = new GetMaxUploadSizeUseCase(
      request.server.repos.systemSetting,
      request.server.config.storage.maxUploadSizeBytes,
    );
    const { maxUploadSizeBytes: currentMax } = await maxUploadUseCase.execute();

    return reply.status(200).send({ openRegistration: enabled, maxUploadSizeBytes: currentMax });
  });
}
