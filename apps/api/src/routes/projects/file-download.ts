import type { FastifyInstance } from 'fastify';
import {
  DownloadFileUseCase,
  PermissionDeniedError,
  FileNodeNotFoundError,
  ValidationError,
  UserId,
  ProjectId,
  FileNodeId,
} from '@asciidocollab/domain';
import { requireAuth, getAuthenticatedUserId } from '../../plugins/require-auth';

/** Streams a single project file as a download. */
export async function fileDownloadRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string; fileNodeId: string } }>(
    '/projects/:projectId/files/:fileNodeId/download',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: app.config.downloads.file.rateLimitMax,
          timeWindow: app.config.downloads.file.rateLimitWindow,
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const fileNodeId = FileNodeId.create(request.params.fileNodeId);

      const useCase = new DownloadFileUseCase(
        request.server.repos.project,
        request.server.repos.fileNode,
        request.server.repos.projectMember,
        request.server.stores.fileStore,
      );

      const result = await useCase.execute(actorId, projectId, fileNodeId);

      if (!result.success) {
        const { error } = result;
        if (error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: error.message } });
        }
        if (error instanceof FileNodeNotFoundError) {
          return reply.status(404).send({ error: { code: 'FILE_NOT_FOUND', message: error.message } });
        }
        if (error instanceof ValidationError) {
          return reply.status(400).send({ error: { code: 'INVALID_NODE_TYPE', message: error.message } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } });
      }

      const { fileNode, filePath } = result.value;
      const stream = await request.server.stores.fileStore.readStream(projectId, filePath);

      if (stream === null) {
        return reply.status(404).send({ error: { code: 'FILE_NOT_FOUND', message: 'File not found in storage' } });
      }

      reply.raw.setHeader('Content-Disposition', `attachment; filename="${fileNode.name}"`);
      stream.pipe(reply.raw);
      return reply;
    },
  );
}
