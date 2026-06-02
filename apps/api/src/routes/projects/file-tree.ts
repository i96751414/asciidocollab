import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  CreateFileUseCase,
  CreateFolderUseCase,
  DeleteFileUseCase,
  RenameFileUseCase,
  MoveFileUseCase,
  UserId,
  ProjectId,
  FileNodeId,
  MimeType,
  PermissionDeniedError,
  FileNodeNotFoundError,
  FileConflictError,
  CannotDeleteRootFolderError,
} from '@asciidocollab/domain';
import type { FileTreeEventDto } from '@asciidocollab/shared';
import { getAuthenticatedUserId } from '../../plugins/require-auth';

type CreateBody = { type: 'file' | 'folder'; parentId: string; name: string; mimeType?: string };
type PatchBody = { name?: string; parentId?: string };

function toNodeType(value: string): 'file' | 'folder' {
  return value === 'folder' ? 'folder' : 'file';
}

/** Registers file tree CRUD routes under /projects/:projectId/files. */
export async function fileTreeRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { projectId: string }; Body: CreateBody }>(
    '/projects/:projectId/files',
    {
      schema: {
        body: {
          type: 'object',
          required: ['type', 'parentId', 'name'],
          properties: {
            type: { type: 'string', enum: ['file', 'folder'] },
            parentId: { type: 'string' },
            name: { type: 'string' },
            mimeType: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const { type, parentId, name, mimeType } = request.body;
      const parentFileNodeId = FileNodeId.create(parentId);

      if (type === 'folder') {
        const useCase = new CreateFolderUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.stores.fileStore,
        );
        const result = await useCase.execute(actorId, projectId, parentFileNodeId, name);

        if (!result.success) return sendFileTreeError(reply, result.error);
        const event: FileTreeEventDto = { type: 'created', fileNodeId: result.value.fileNodeId.value, nodeType: 'folder', name, path: result.value.path.value, parentId: parentId };
        request.server.fileTreeEventBus.emit(projectId.value, event);
        return reply.status(201).send({ fileNodeId: result.value.fileNodeId.value, path: result.value.path.value });
      } else {
        const mime = MimeType.create(mimeType ?? 'text/asciidoc');
        const useCase = new CreateFileUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.repos.document,
          request.server.stores.fileStore,
        );
        const result = await useCase.execute(actorId, projectId, parentFileNodeId, name, mime, Buffer.alloc(0));

        if (!result.success) return sendFileTreeError(reply, result.error);
        const event: FileTreeEventDto = { type: 'created', fileNodeId: result.value.fileNodeId.value, nodeType: 'file', name, path: result.value.path.value, parentId: parentId };
        request.server.fileTreeEventBus.emit(projectId.value, event);
        return reply.status(201).send({ fileNodeId: result.value.fileNodeId.value, path: result.value.path.value });
      }
    },
  );

  app.delete<{ Params: { projectId: string; fileNodeId: string } }>(
    '/projects/:projectId/files/:fileNodeId',
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const fileNodeId = FileNodeId.create(request.params.fileNodeId);

      const useCase = new DeleteFileUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.repos.document,
        request.server.repos.auditLog,
        request.server.stores.fileStore,
        request.server.stores.yjsStateStore,
      );

      const fileNodeBeforeDelete = await request.server.repos.fileNode.findById(fileNodeId);
      const result = await useCase.execute(actorId, fileNodeId, projectId);
      if (!result.success) return sendFileTreeError(reply, result.error);
      if (fileNodeBeforeDelete) {
        const event: FileTreeEventDto = { type: 'deleted', fileNodeId: fileNodeId.value, nodeType: toNodeType(fileNodeBeforeDelete.type.value), name: fileNodeBeforeDelete.name, path: fileNodeBeforeDelete.path.value, parentId: fileNodeBeforeDelete.parentId?.value ?? null };
        request.server.fileTreeEventBus.emit(projectId.value, event);
      }
      return reply.status(204).send();
    },
  );

  app.patch<{ Params: { projectId: string; fileNodeId: string }; Body: PatchBody }>(
    '/projects/:projectId/files/:fileNodeId',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            parentId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const fileNodeId = FileNodeId.create(request.params.fileNodeId);
      const { name, parentId } = request.body;

      if (name !== undefined && parentId !== undefined) {
        // Both rename and move
        const renameUseCase = new RenameFileUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.repos.auditLog,
          request.server.stores.fileStore,
        );
        const renameResult = await renameUseCase.execute(actorId, fileNodeId, name, projectId);
        if (!renameResult.success) return sendFileTreeError(reply, renameResult.error);

        const moveUseCase = new MoveFileUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.stores.fileStore,
        );
        const newParentId = FileNodeId.create(parentId);
        const moveResult = await moveUseCase.execute(actorId, projectId, fileNodeId, newParentId);
        if (!moveResult.success) return sendFileTreeError(reply, moveResult.error);

        const updatedNode = await request.server.repos.fileNode.findById(fileNodeId);
        if (updatedNode) {
          const event: FileTreeEventDto = {
            type: 'moved',
            fileNodeId: fileNodeId.value,
            nodeType: toNodeType(updatedNode.type.value),
            name,
            path: moveResult.value.newPath.value,
            parentId,
          };
          request.server.fileTreeEventBus.emit(projectId.value, event);
        }
        return reply.status(204).send();
      } else if (name !== undefined) {
        const useCase = new RenameFileUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.repos.auditLog,
          request.server.stores.fileStore,
        );
        const result = await useCase.execute(actorId, fileNodeId, name, projectId);
        if (!result.success) return sendFileTreeError(reply, result.error);
        const renamedNode = await request.server.repos.fileNode.findById(fileNodeId);
        if (renamedNode) {
          const event: FileTreeEventDto = { type: 'renamed', fileNodeId: fileNodeId.value, nodeType: toNodeType(renamedNode.type.value), name, path: result.value.newPath.value, parentId: renamedNode.parentId?.value ?? null };
          request.server.fileTreeEventBus.emit(projectId.value, event);
        }
        return reply.status(204).send();
      } else if (parentId !== undefined) {
        const useCase = new MoveFileUseCase(
          request.server.repos.projectMember,
          request.server.repos.fileNode,
          request.server.stores.fileStore,
        );
        const newParentId = FileNodeId.create(parentId);
        const result = await useCase.execute(actorId, projectId, fileNodeId, newParentId);
        if (!result.success) return sendFileTreeError(reply, result.error);
        const movedNode = await request.server.repos.fileNode.findById(fileNodeId);
        if (movedNode) {
          const event: FileTreeEventDto = { type: 'moved', fileNodeId: fileNodeId.value, nodeType: toNodeType(movedNode.type.value), name: movedNode.name, path: result.value.newPath.value, parentId: parentId };
          request.server.fileTreeEventBus.emit(projectId.value, event);
        }
        return reply.status(204).send();
      }

      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Provide name or parentId' } });
    },
  );
}

function sendFileTreeError(reply: FastifyReply, error: Error) {
  if (error instanceof PermissionDeniedError) {
    return reply.status(403).send({ error: { code: 'FORBIDDEN', message: error.message } });
  }
  if (error instanceof FileConflictError) {
    const body: Record<string, unknown> = { error: { code: 'CONFLICT', message: error.message } };
    if (error.existingId) body['existingFileNodeId'] = error.existingId;
    return reply.status(409).send(body);
  }
  if (error instanceof FileNodeNotFoundError) {
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
  }
  if (error instanceof CannotDeleteRootFolderError) {
    return reply.status(400).send({ error: { code: 'CANNOT_DELETE_ROOT', message: error.message } });
  }
  return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
