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
            passwordPolicy: {
              type: 'object',
              properties: {
                minLength: { type: 'integer' },
                requireUppercase: { type: 'boolean' },
                requireLowercase: { type: 'boolean' },
                requireDigits: { type: 'boolean' },
                requireSymbols: { type: 'boolean' },
              },
              required: ['minLength', 'requireUppercase', 'requireLowercase', 'requireDigits', 'requireSymbols'],
            },
          },
          required: ['configured', 'passwordPolicy'],
        },
      },
    },
  }, async (_request, reply) => {
    const useCase = new CheckSystemSetupUseCase(reply.server.repos.user);
    const { configured } = await useCase.execute();
    const { auth } = reply.server.config;
    const response: SetupStatusDto = {
      configured,
      passwordPolicy: {
        minLength: auth.password.minLength,
        requireUppercase: auth.password.requireUppercase,
        requireLowercase: auth.password.requireLowercase,
        requireDigits: auth.password.requireDigits,
        requireSymbols: auth.password.requireSymbols,
      },
    };
    return reply.status(200).send(response);
  });
}
