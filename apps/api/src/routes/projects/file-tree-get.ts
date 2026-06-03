import type { FastifyInstance } from 'fastify';
import {
  GetProjectTreeUseCase,
  UserId,
  ProjectId,
  PermissionDeniedError,
  ProjectNotFoundError,
} from '@asciidocollab/domain';
import { getAuthenticatedUserId } from '../../plugins/require-auth';

/** Registers GET /projects/:projectId/files — returns the full file tree rooted at the project root folder. */
export async function fileTreeGetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/files',
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);

      const useCase = new GetProjectTreeUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.repos.document,
        request.server.repos.project,
      );

      const result = await useCase.execute(actorId, projectId);

      if (!result.success) {
        if (result.error instanceof ProjectNotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: result.error.message } });
        }
        if (result.error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch file tree' } });
      }

      return reply.status(200).send(addParentIds(result.value.root, null));
    },
  );
}

interface TreeNode {
  id: string;
  name: string;
  type: string;
  path: string;
  mimeType?: string;
  children: TreeNode[];
}

interface TreeNodeWithParent extends TreeNode {
  parentId: string | null;
  children: TreeNodeWithParent[];
}

function addParentIds(node: TreeNode, parentId: string | null): TreeNodeWithParent {
  return {
    ...node,
    parentId,
    children: node.children.map((child) => addParentIds(child, node.id)),
  };
}
