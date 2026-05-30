import type { FastifyInstance } from 'fastify';
import { CheckSystemSetupUseCase } from '@asciidocollab/domain';
import type { SetupStatusDto } from '@asciidocollab/shared';

/**
 * Registers the GET /auth/setup-status route.
 *
 * @param app - The Fastify instance to register the route on.
 */
export async function setupStatusRoute(app: FastifyInstance): Promise<void> {
  app.get('/auth/setup-status', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            configured: { type: 'boolean' },
          },
          required: ['configured'],
        },
      },
    },
  }, async (_request, reply) => {
    const useCase = new CheckSystemSetupUseCase(reply.server.repos.user);
    const result = await useCase.execute();
    return reply.status(200).send(result satisfies SetupStatusDto);
  });
}
