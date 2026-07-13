import type { FastifyInstance } from 'fastify';
import {
  GetProjectRenderConfigUseCase,
  SaveProjectRenderConfigUseCase,
  UserId,
  ProjectId,
  PermissionDeniedError,
} from '@asciidocollab/domain';
import { safeNormalizeRenderConfig } from '@asciidocollab/shared';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import { requestContextFrom } from '../../lib/request-context';

/**
 * Registers the project render-config endpoints:
 *  - `GET /api/projects/:projectId/render-config` — any member reads the project's render options (an
 *    empty object when none is set).
 *  - `PUT /api/projects/:projectId/render-config` — an editor/owner replaces them.
 *
 * The option SEMANTICS are validated here with the shared `renderConfigSchema` (the single validation
 * authority) before the use case runs; authorization lives entirely in the use cases (no route-level
 * permission check). Both handlers map the typed `Result` to HTTP.
 */
export async function renderConfigRoutes(app: FastifyInstance): Promise<void> {
  const parametersSchema = {
    type: 'object',
    required: ['projectId'],
    properties: { projectId: { type: 'string' } },
  } as const;

  const rateLimit = {
    max: app.config.project.renderConfig.rateLimitMax,
    timeWindow: app.config.project.renderConfig.rateLimitWindow,
  };

  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/render-config',
    { config: { rateLimit }, schema: { params: parametersSchema } },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);

      const useCase = new GetProjectRenderConfigUseCase(
        request.server.repos.projectRenderConfig,
        request.server.repos.projectMember,
      );
      const result = await useCase.execute(actorId, projectId);

      if (!result.success) {
        // The read use case's only failure mode is a membership denial (its Result error type is
        // exactly PermissionDeniedError), so any failure maps straight to 403.
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
      }

      return reply.status(200).send({ data: result.value?.config ?? {} });
    },
  );

  app.put<{ Params: { projectId: string }; Body: unknown }>(
    '/api/projects/:projectId/render-config',
    { config: { rateLimit }, schema: { params: parametersSchema, body: { type: 'object' } } },
    async (request, reply) => {
      const parsed = safeNormalizeRenderConfig(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'ValidationFailed', message: parsed.error.message } });
      }

      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);

      const useCase = new SaveProjectRenderConfigUseCase(
        request.server.repos.projectRenderConfig,
        request.server.repos.projectMember,
        request.server.repos.auditLog,
      );
      const result = await useCase.execute(actorId, projectId, parsed.data, requestContextFrom(request));

      if (!result.success) {
        const { error } = result;
        if (error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: error.message } });
        }
        // The body was validated against the shared render-config schema above (invalid input already
        // returned 400), so the save use case's structural ValidationError cannot occur here; this
        // fallback guards only a truly unexpected failure.
        return reply
          .status(500)
          .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to save render config' } });
      }

      return reply.status(200).send({ data: result.value.config });
    },
  );
}
