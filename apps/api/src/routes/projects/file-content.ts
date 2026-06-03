import type { FastifyInstance } from 'fastify';
import {
  GetDocumentContentUseCase,
  SaveDocumentContentUseCase,
  UserId,
  ProjectId,
  FileNodeId,
  PermissionDeniedError,
  FileNodeNotFoundError,
  ContentNotFoundError,
} from '@asciidocollab/domain';
import { getAuthenticatedUserId } from '../../plugins/require-auth';

/** Registers GET and PUT routes for reading/writing file content. */
export async function fileContentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string; fileNodeId: string } }>(
    '/projects/:projectId/files/:fileNodeId/content',
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const fileNodeId = FileNodeId.create(request.params.fileNodeId);

      const useCase = new GetDocumentContentUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.repos.document,
        request.server.stores.fileStore,
      );

      const result = await useCase.execute(actorId, projectId, fileNodeId);

      if (!result.success) {
        if (result.error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
        }
        if (result.error instanceof FileNodeNotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
        }
        if (result.error instanceof ContentNotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'The requested content could not be found' } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
      }

      return reply
        .status(200)
        .header('Content-Type', result.value.mimeType.value)
        .send(result.value.content);
    },
  );

  app.put<{ Params: { projectId: string; fileNodeId: string } }>(
    '/projects/:projectId/files/:fileNodeId/content',
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const fileNodeId = FileNodeId.create(request.params.fileNodeId);

      const rawBody = request.body;
      const content = Buffer.isBuffer(rawBody)
        ? rawBody
        : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));

      const useCase = new SaveDocumentContentUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.repos.document,
        request.server.stores.fileStore,
      );

      const result = await useCase.execute(actorId, projectId, fileNodeId, content);

      if (!result.success) {
        if (result.error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
        }
        if (result.error instanceof FileNodeNotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
      }

      return reply.status(204).send();
    },
  );
}
