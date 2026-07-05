import type { FastifyInstance } from 'fastify';
import {
  FindReferencesUseCase,
  RenameSymbolUseCase,
  UserId,
  ProjectId,
  PermissionDeniedError,
  ValidationError,
} from '@asciidocollab/domain';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import { requestContextFrom } from '../../lib/request-context';
import { requestLogger } from '../../lib/request-logger';

/**
 * Registers the cross-file refactoring endpoints:
 *   - `GET  /projects/:projectId/symbol-usages?name=…` — find-usages.
 *   - `POST /projects/:projectId/symbol-rename` — rename id/anchor/attribute.
 *
 * Authorization lives entirely in the use cases (security_constitution: no
 * route-level permission check) — find-usages requires project membership,
 * rename requires editor/owner. Both opt into a shared per-route rate limit
 * because each scans (and rename writes) every AsciiDoc file in the project.
 */
export async function projectRefactoringRoutes(app: FastifyInstance): Promise<void> {
  const rateLimit = {
    max: app.config.project.refactoring.rateLimitMax,
    timeWindow: app.config.project.refactoring.rateLimitWindow,
  };
  // Detection (read-only symbol-usages) auto-fires as the author edits, so it gets its
  // own, higher budget — decoupled from the conservative apply (rename) budget above.
  const suggestionRateLimit = {
    max: app.config.project.refactoring.suggestionRateLimitMax,
    timeWindow: app.config.project.refactoring.suggestionRateLimitWindow,
  };

  app.get<{ Params: { projectId: string }; Querystring: { name: string; kind?: 'anchor' | 'attribute' } }>(
    '/projects/:projectId/symbol-usages',
    {
      config: { rateLimit: suggestionRateLimit },
      schema: {
        params: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string' } } },
        querystring: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            kind: { type: 'string', enum: ['anchor', 'attribute'] },
          },
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);

      const useCase = new FindReferencesUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.stores.fileStore,
        // Scan live Yjs content for files open in a collab room, so a just-typed (unsaved) symbol
        // is found instead of being missed because the file store projection still lags it.
        request.server.repos.document,
        request.server.stores.collaborativeContentEditor,
        requestLogger(request),
        // Read only for the configured main file id, so inherited id-generation attributes
        // (`idprefix`/`idseparator`) resolve section ids the same way the preview/editor do.
        request.server.repos.project,
      );

      const result = await useCase.execute(actorId, projectId, request.query.name, request.query.kind);
      if (!result.success) {
        if (result.error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to find usages' } });
      }

      return reply.status(200).send({
        data: {
          usages: result.value.map((usage) => ({
            fileNodeId: usage.fileNodeId.value,
            path: usage.path,
            kind: usage.kind,
            // Present only for `definition` usages; lets the client tell a derived section id from an
            // explicit anchor, so an unrelated same-id heading is not counted as a rewritable usage.
            ...(usage.definitionKind && { definitionKind: usage.definitionKind }),
            range: { from: usage.range.from, to: usage.range.to },
          })),
        },
      });
    },
  );

  app.post<{
    Params: { projectId: string };
    Body: {
      symbolKind: 'anchor' | 'attribute';
      oldName: string;
      newName: string;
      definitionAlreadyRenamed?: boolean;
      renamedDefinitionIsSection?: boolean;
    };
  }>(
    '/projects/:projectId/symbol-rename',
    {
      config: { rateLimit },
      schema: {
        params: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['symbolKind', 'oldName', 'newName'],
          properties: {
            symbolKind: { type: 'string', enum: ['anchor', 'attribute'] },
            oldName: { type: 'string', minLength: 1, maxLength: 200 },
            newName: { type: 'string', minLength: 1, maxLength: 200 },
            definitionAlreadyRenamed: { type: 'boolean' },
            renamedDefinitionIsSection: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);

      const useCase = new RenameSymbolUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.stores.fileStore,
        request.server.repos.auditLog,
        requestLogger(request),
        // Route the rewrite through the Yjs source of truth for any file open in a live collab
        // room, so the rename is visible in the editor and not clobbered by the next writeback,
        // and SCAN live content so a just-typed (unsaved) symbol is found and renamed.
        request.server.repos.document,
        request.server.stores.collaborativeContentEditor,
        request.server.stores.collaborativeContentEditor,
        // Read only for the configured main file id, so inherited id-generation attributes
        // (`idprefix`/`idseparator`) resolve section ids the same way the preview/editor do.
        request.server.repos.project,
      );

      const result = await useCase.execute(
        actorId,
        projectId,
        {
          symbolKind: request.body.symbolKind,
          oldName: request.body.oldName,
          newName: request.body.newName,
          definitionAlreadyRenamed: request.body.definitionAlreadyRenamed ?? false,
          renamedDefinitionIsSection: request.body.renamedDefinitionIsSection ?? false,
        },
        requestContextFrom(request),
      );

      if (!result.success) {
        if (result.error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
        }
        if (result.error instanceof ValidationError) {
          return reply.status(400).send({ error: { code: 'INVALID_SYMBOL_RENAME', message: result.error.message } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to rename symbol' } });
      }

      return reply.status(200).send({ data: result.value });
    },
  );
}
