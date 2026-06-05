import type { FastifyInstance } from 'fastify';
import {
  DeleteFileUseCase,
  UserId,
  ProjectId,
  FileNodeId,
} from '@asciidocollab/domain';
import type { FileTreeEventDto } from '@asciidocollab/shared';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import { sendFileTreeError, toNodeType } from './file-tree-errors';

/** Registers DELETE /projects/:projectId/files/:fileNodeId. */
export async function fileTreeDeleteRoutes(app: FastifyInstance): Promise<void> {
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
}
