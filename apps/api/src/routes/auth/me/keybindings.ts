import type { FastifyInstance } from 'fastify';
import {
  GetKeyBindingsUseCase,
  UpdateKeyBindingUseCase,
  ResetKeyBindingUseCase,
  KeyBindingConflictError,
  ValidationError,
} from '@asciidocollab/domain';
import { getAuthenticatedUserId } from '../../../plugins/require-auth';

/** Registers key binding routes under /auth/me/keybindings. */
export async function keybindingsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { namespace?: string } }>(
    '/auth/me/keybindings',
    async (request, reply) => {
      const userId = getAuthenticatedUserId(request);
      const useCase = new GetKeyBindingsUseCase(request.server.repos.keyBinding);
      const bindings = await useCase.execute(userId, request.query.namespace);
      return reply.status(200).send(bindings);
    },
  );

  app.patch<{ Params: { action: string }; Body: { keyCombo: string } }>(
    '/auth/me/keybindings/:action',
    {
      schema: {
        body: {
          type: 'object',
          required: ['keyCombo'],
          properties: { keyCombo: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthenticatedUserId(request);
      const action = decodeURIComponent(request.params.action);
      const { keyCombo } = request.body;

      const useCase = new UpdateKeyBindingUseCase(request.server.repos.keyBinding);
      const result = await useCase.execute(userId, action, keyCombo);

      if (!result.success) {
        if (result.error instanceof KeyBindingConflictError) {
          return reply.status(409).send({ error: { code: 'CONFLICT', message: result.error.message } });
        }
        if (result.error instanceof ValidationError) {
          return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: result.error.message } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An error occurred' } });
      }

      const getUseCase = new GetKeyBindingsUseCase(request.server.repos.keyBinding);
      const bindings = await getUseCase.execute(userId);
      const binding = bindings.find((b) => b.action === action);
      return reply.status(200).send(binding);
    },
  );

  app.delete<{ Params: { action: string } }>(
    '/auth/me/keybindings/:action',
    async (request, reply) => {
      const userId = getAuthenticatedUserId(request);
      const action = decodeURIComponent(request.params.action);

      const useCase = new ResetKeyBindingUseCase(request.server.repos.keyBinding);
      const result = await useCase.execute(userId, action);

      if (!result.success) {
        if (result.error instanceof ValidationError) {
          return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: result.error.message } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An error occurred' } });
      }

      return reply.status(204).send();
    },
  );
}
