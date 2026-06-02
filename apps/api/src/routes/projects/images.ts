import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import {
  UploadAssetUseCase,
  GetAssetContentUseCase,
  UserId,
  ProjectId,
  FileNodeId,
  ImageId,
  MimeType,
  PermissionDeniedError,
  FileNodeNotFoundError,
  FileConflictError,
  ValidationError,
  ContentNotFoundError,
} from '@asciidocollab/domain';
import type { FileTreeEventDto } from '@asciidocollab/shared';
import { getAuthenticatedUserId } from '../../plugins/require-auth';

/** Registers image upload and retrieval routes. Requires `@fastify/multipart` to be installed. */
export async function imagesRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  app.post<{ Params: { projectId: string }; Querystring: { parentId: string } }>(
    '/projects/:projectId/images',
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const parentId = FileNodeId.create(request.query.parentId);

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'No file provided' } });
      }

      const bytes = await data.toBuffer();
      const mimeType = MimeType.create(data.mimetype || 'application/octet-stream');

      const useCase = new UploadAssetUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.repos.image,
        request.server.stores.fileStore,
        request.server.repos.systemSetting,
        request.server.config.storage.maxUploadSizeBytes,
      );

      const result = await useCase.execute(actorId, projectId, parentId, data.filename, mimeType, bytes);

      if (!result.success) {
        if (result.error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
        }
        if (result.error instanceof ValidationError) {
          return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'File exceeds maximum permitted size' } });
        }
        if (result.error instanceof FileConflictError) {
          return reply.status(409).send({ error: { code: 'CONFLICT', message: result.error.message } });
        }
        if (result.error instanceof FileNodeNotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Parent folder not found' } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
      }

      const event: FileTreeEventDto = { type: 'created', fileNodeId: result.value.fileNodeId.value, nodeType: 'file', name: data.filename, path: result.value.storagePath, parentId: request.query.parentId };
      request.server.fileTreeEventBus.emit(projectId.value, event);

      return reply.status(201).send({
        assetId: result.value.assetId.value,
        storagePath: result.value.storagePath,
      });
    },
  );

  app.get<{ Params: { projectId: string; assetId: string } }>(
    '/projects/:projectId/images/:assetId',
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const assetId = ImageId.create(request.params.assetId);

      const useCase = new GetAssetContentUseCase(
        request.server.repos.projectMember,
        request.server.repos.image,
        request.server.repos.fileNode,
        request.server.stores.fileStore,
      );

      const result = await useCase.execute(actorId, projectId, assetId);

      if (!result.success) {
        if (result.error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
        }
        if (result.error instanceof FileNodeNotFoundError || result.error instanceof ContentNotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Asset not found' } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
      }

      return reply
        .status(200)
        .header('Content-Type', result.value.mimeType.value)
        .header('Content-Disposition', `attachment; filename="${result.value.filename.replaceAll('"', '')}"`)
        .send(result.value.bytes);
    },
  );
}
