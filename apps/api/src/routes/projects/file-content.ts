import type { FastifyInstance } from 'fastify';
import {
  GetFileNodeContentUseCase,
  SaveDocumentContentUseCase,
  GetDocumentCollabInfoUseCase,
  UserId,
  ProjectId,
  FileNodeId,
  PermissionDeniedError,
  FileNodeNotFoundError,
  ContentNotFoundError,
  ActiveCollaborationSessionError,
} from '@asciidocollab/domain';
import type { CollabDocumentInfo } from '@asciidocollab/shared';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import { logAuthorizationDenial } from '../audit-log-denial';
import { requestLogger } from '../../lib/request-logger';

/** Registers GET and PUT routes for reading/writing file content. */
export async function fileContentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string; fileNodeId: string } }>(
    '/projects/:projectId/files/:fileNodeId/content',
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const fileNodeId = FileNodeId.create(request.params.fileNodeId);

      const useCase = new GetFileNodeContentUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.repos.document,
        request.server.repos.asset,
        request.server.stores.fileStore,
        // Read a document's live collaborative text (Hocuspocus/Yjs source of truth) when a session
        // is open, so cross-document resolution never sees a stale file with unsaved edits.
        request.server.stores.collaborativeContentEditor,
        // Gate the live read on an active session so dormant documents skip the collab round-trip
        // (the file store is already current — the collab server writes back on disconnect).
        request.server.repos.collaborationSession,
        // Surface a live-read failure (collab unreachable ⇒ stale file-store fallback) rather than
        // serving stale content silently.
        requestLogger(request),
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

      const reply200 = reply
        .status(200)
        .header('Content-Type', result.value.mimeType.value);
      if (result.value.contentId) {
        reply200.header('ETag', `"${result.value.contentId}"`);
      }
      return reply200.send(result.value.content);
    },
  );

  app.get<{ Params: { projectId: string; fileNodeId: string } }>(
    '/projects/:projectId/files/:fileNodeId/collab',
    {
      config: {
        rateLimit: {
          max: app.config.project.fileContent.rateLimitMax,
          timeWindow: app.config.project.fileContent.rateLimitWindow,
        },
      },
      schema: {
        params: {
          type: 'object',
          required: ['projectId', 'fileNodeId'],
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            fileNodeId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);
      const fileNodeId = FileNodeId.create(request.params.fileNodeId);

      const useCase = new GetDocumentCollabInfoUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.repos.document,
      );

      const result = await useCase.execute(actorId, projectId, fileNodeId);

      if (!result.success) {
        if (result.error instanceof PermissionDeniedError) {
          // Authorization-denial audit (§Audit): actor, resource, reason — never secrets.
          logAuthorizationDenial(request.log, {
            actor: actorId.value,
            resource: `projects/${projectId.value}/files/${fileNodeId.value}`,
            reason: 'not_a_member',
          });
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this project' } });
        }
        if (result.error instanceof FileNodeNotFoundError || result.error instanceof ContentNotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No collaborative document for this file' } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
      }

      const body: CollabDocumentInfo = { yjsStateId: result.value.yjsStateId, role: result.value.role };
      return reply.status(200).send(body);
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
        request.server.repos.collaborationSession,
      );

      const result = await useCase.execute(actorId, projectId, fileNodeId, content);

      if (!result.success) {
        if (result.error instanceof ActiveCollaborationSessionError) {
          return reply.status(409).send({ error: { code: 'CONFLICT', message: 'This file is currently being edited by active collaborators. Please try again later.' } });
        }
        if (result.error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
        }
        if (result.error instanceof FileNodeNotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
      }

      // A save changes a file's persisted content — tell any open dependent documents to refresh so a
      // sessionless (or session) save propagates without a reconnect or a structural file event.
      request.server.fileTreeEventBus.emit(projectId.value, {
        type: 'content-changed',
        fileNodeId: fileNodeId.value,
      });

      return reply.status(204).header('ETag', `"${result.value.contentId}"`).send();
    },
  );
}
