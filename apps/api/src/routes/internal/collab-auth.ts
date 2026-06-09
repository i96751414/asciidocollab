import type { FastifyInstance } from 'fastify';
import { YjsStateId, UserId, ProjectId, AuthorizeCollabConnectionUseCase } from '@asciidocollab/domain';
import type { CollabAuthResponse } from '@asciidocollab/shared';
import { logAuthorizationDenial } from '../audit-log-denial';

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

      // Delegate the authorization decision (document ownership + membership + role mapping) to the
      // domain use case, which is shared with the REST collab-info path so both gates agree.
      const useCase = new AuthorizeCollabConnectionUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.repos.document,
      );
      const result = await useCase.execute(
        UserId.create(request.session.userId),
        ProjectId.create(projectIdString),
        YjsStateId.create(yjsStateIdString),
      );

      if (!result.success) {
        // Authorization-denial audit (SEC4 / §Audit): log actor, resource, reason; never the cookie.
        logAuthorizationDenial(request.log, { actor: request.session.userId, resource: documentName, reason: result.error.reason });
        return reply.status(403).send({ error: 'Not a member of this project' });
      }

      return reply.status(200).send({ role: result.value.role, userId: request.session.userId } satisfies CollabAuthResponse);
    },
  );
}
