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
import { requestLogger } from '../../lib/request-logger';
import { sanitizeContentDispositionFilename, buildAttachmentDisposition } from '../../lib/sanitize-filename';

/** Streams a single project file as a download, serving live Yjs text when a session is active. */
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
        request.server.repos.document,
        request.server.repos.collaborationSession,
        request.server.stores.collaborativeContentEditor,
        requestLogger(request),
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

      const { fileNode, filePath, source } = result.value;
      const asciiFilename = sanitizeContentDispositionFilename(fileNode.name) || 'file';
      const disposition = buildAttachmentDisposition(fileNode.name, asciiFilename);

      if (source.kind === 'inline') {
        // S4: octet-stream prevents hostile source from being content-sniffed/rendered inline
        return reply
          .header('content-type', 'application/octet-stream')
          .header('content-disposition', disposition)
          .send(source.bytes);
      }

      const stream = await request.server.stores.fileStore.readStream(projectId, filePath);
      if (stream === null) {
        return reply.status(404).send({ error: { code: 'FILE_NOT_FOUND', message: 'File not found in storage' } });
      }

      // S4: octet-stream prevents hostile source from being content-sniffed/rendered inline.
      // Attach error handler before reply.send() so the stream's 'error' event has a listener
      // when reply.send() pipes synchronously — preventing an unhandled EventEmitter error.
      stream.on('error', (error) => {
        request.log.warn({ projectId: projectId.value, path: filePath.value, error: error.message }, 'stream error during file download');
        // reply.raw.end() intentionally omitted — Fastify's eos handler calls res.destroy() when
        // headers are already sent, which aborts the TCP connection instead of sending a false-200.
      });
      return reply
        .header('content-type', 'application/octet-stream')
        .header('content-disposition', disposition)
        .send(stream);
    },
  );
}
