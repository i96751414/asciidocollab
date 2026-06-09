import type { FastifyInstance } from 'fastify';
import { YjsStateId, UserId, ProjectId } from '@asciidocollab/domain';
import type { CollabAuthResponse } from '@asciidocollab/shared';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Registers the internal collab auth GET endpoint used by the collaboration server. */
export async function collabAuthRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { documentName: string } }>(
    '/internal/collab/auth',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['documentName'],
          properties: {
            documentName: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.session.userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const { documentName } = request.query;
      const slash = documentName.indexOf('/');
      if (slash === -1) {
        return reply.status(400).send({ error: 'Invalid documentName format' });
      }

      const projectIdString = documentName.slice(0, slash);
      const yjsStateIdString = documentName.slice(slash + 1);

      if (!UUID_REGEX.test(projectIdString) || !UUID_REGEX.test(yjsStateIdString)) {
        return reply.status(400).send({ error: 'Invalid documentName: both parts must be UUIDs' });
      }

      const yjsStateId = YjsStateId.create(yjsStateIdString);
      const projectId = ProjectId.create(projectIdString);

      const document = await request.server.repos.document.findByYjsStateId(yjsStateId);
      if (!document) {
        return reply.status(403).send({ error: 'Not a member of this project' });
      }

      // Verify the document belongs to the project claimed in the room name.
      // Without this check a user could craft a room name with their own projectId
      // but another project's yjsStateId to join a document they have no access to.
      const fileNode = await request.server.repos.fileNode.findById(document.fileNodeId);
      if (!fileNode || !fileNode.projectId.equals(projectId)) {
        return reply.status(403).send({ error: 'Not a member of this project' });
      }

      const userId = UserId.create(request.session.userId);
      const member = await request.server.repos.projectMember.findByCompositeKey(projectId, userId);
      if (!member) {
        return reply.status(403).send({ error: 'Not a member of this project' });
      }

      const role: CollabAuthResponse['role'] = member.role.value === 'viewer' ? 'observer' : 'editor';
      return reply.status(200).send({ role } satisfies CollabAuthResponse);
    },
  );
}
