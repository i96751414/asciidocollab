import type { FastifyInstance } from 'fastify';
import { GetOpenRegistrationUseCase } from '@asciidocollab/domain';

/** Registers the open registration status route on the Fastify instance. */
export async function openRegistrationStatusRoute(app: FastifyInstance): Promise<void> {
  app.get('/auth/open-registration-status', {
    config: {
      rateLimit: {
        max: app.config.admin.openRegistration.rateLimitMax,
        timeWindow: app.config.admin.openRegistration.rateLimitWindow,
      },
    },
  }, async (_request, reply) => {
    const useCase = new GetOpenRegistrationUseCase(_request.server.repos.systemSetting);
    const { enabled } = await useCase.execute();
    return reply.status(200).send({ openRegistration: enabled });
  });
}
