import type { FastifyInstance } from 'fastify';
import {
  SetProjectMainFileUseCase,
  UserId,
  ProjectId,
  PermissionDeniedError,
  ProjectNotFoundError,
  MainFileNotFoundError,
  MainFileNotAsciidocError,
} from '@asciidocollab/domain';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import { requestContextFrom } from '../../lib/request-context';

/**
 * Registers `PUT /projects/:projectId/main-file` — sets or clears the project's
 * configured main AsciiDoc file. Authorization lives entirely in
 * `SetProjectMainFileUseCase`; this route only authenticates, validates the
 * request shape, opts into the per-route rate limit, and maps the typed
 * `Result` to HTTP (security_constitution: no route-level permission check).
 */
export async function projectMainFileRoutes(app: FastifyInstance): Promise<void> {
  app.put<{ Params: { projectId: string }; Body: { mainFileNodeId: string | null } }>(
    '/projects/:projectId/main-file',
    {
      config: {
        rateLimit: {
          max: app.config.project.mainFile.rateLimitMax,
          timeWindow: app.config.project.mainFile.rateLimitWindow,
        },
      },
      schema: {
        params: {
          type: 'object',
          required: ['projectId'],
          properties: { projectId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['mainFileNodeId'],
          properties: { mainFileNodeId: { type: ['string', 'null'] } },
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);

      const useCase = new SetProjectMainFileUseCase(
        request.server.repos.project,
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.repos.auditLog,
      );

      const result = await useCase.execute(
        actorId,
        projectId,
        { mainFileNodeId: request.body.mainFileNodeId },
        requestContextFrom(request),
      );

      if (!result.success) {
        const { error } = result;
        if (error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: error.message } });
        }
        if (error instanceof MainFileNotAsciidocError) {
          return reply.status(400).send({ error: { code: 'MainFileNotAsciiDoc', message: error.message } });
        }
        if (error instanceof MainFileNotFoundError || error instanceof ProjectNotFoundError) {
          return reply.status(404).send({ error: { code: 'MainFileNotFound', message: error.message } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to set main file' } });
      }

      const project = result.value;

      // The main file anchors every open document's inherited context; a change re-resolves them all,
      // so broadcast a main-file-changed event (mainFileNodeId is null when the main file is cleared).
      request.server.fileTreeEventBus.emit(projectId.value, {
        type: 'main-file-changed',
        mainFileNodeId: project.mainFileNodeId?.value ?? null,
      });

      return reply.status(200).send({
        data: {
          id: project.id.value,
          name: project.name.value,
          description: project.description,
          tags: [...project.tags],
          rootFolderId: project.rootFolderId?.value ?? null,
          mainFileNodeId: project.mainFileNodeId?.value ?? null,
          archivedAt: project.archivedAt?.toISOString() ?? null,
          updatedAt: project.updatedAt.toISOString(),
        },
      });
    },
  );
}
