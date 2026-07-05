import type { FastifyInstance } from 'fastify';
import {
  SearchProjectContentUseCase,
  ReplaceProjectContentUseCase,
  UserId,
  ProjectId,
  FileNodeId,
  PermissionDeniedError,
  ValidationError,
} from '@asciidocollab/domain';
import type {
  SearchQuery,
  SearchResult,
  ReplaceProjectContentInput,
  FileReplaceSelection,
  ReplaceOutcome,
} from '@asciidocollab/domain';
import type { SearchMode, SearchResultDto, ReplaceScope, ReplaceResultDto } from '@asciidocollab/shared';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
import { requestContextFrom } from '../../lib/request-context';
import { requestLogger } from '../../lib/request-logger';

/** Body of the project-wide search request (the `SearchQueryDto` wire shape). */
interface SearchRequestBody {
  query: string;
  mode: SearchMode;
  caseSensitive: boolean;
  wholeWord: boolean;
}

/** Maps the HTTP-boundary DTO to the domain query (whole-word is inert in regex mode). */
function toDomainQuery(body: SearchRequestBody): SearchQuery {
  return {
    text: body.query,
    mode: body.mode,
    caseSensitive: body.caseSensitive,
    wholeWord: body.mode === 'regex' ? false : body.wholeWord,
  };
}

/** Body of the project-wide replace request (the `ReplaceRequestDto` wire shape). */
interface ReplaceRequestBody {
  query: SearchRequestBody;
  replacement: string;
  scope: ReplaceScope;
  files: { fileNodeId: string; selections: { ordinal: number; expectedText: string }[] }[];
}

/** Maps the replace DTO to the domain input (ids → value objects). */
function toReplaceInput(body: ReplaceRequestBody): ReplaceProjectContentInput {
  const files: FileReplaceSelection[] = body.files.map((file) => ({
    fileNodeId: FileNodeId.create(file.fileNodeId),
    selections: file.selections.map((s) => ({ ordinal: s.ordinal, expectedText: s.expectedText })),
  }));
  return { query: toDomainQuery(body.query), replacement: body.replacement, scope: body.scope, files };
}

/** Maps the domain replace outcome to the response DTO. */
function toReplaceResultDto(outcome: ReplaceOutcome): ReplaceResultDto {
  return {
    replacedCount: outcome.replacedCount,
    affectedFiles: outcome.affectedFiles,
    skipped: outcome.skipped.map((s) => ({ fileNodeId: s.fileNodeId.value, reason: s.reason })),
  };
}

/** Maps the domain result to the response DTO (value objects → primitives). */
function toResultDto(result: SearchResult): SearchResultDto {
  return {
    groups: result.groups.map((group) => ({
      fileNodeId: group.fileNodeId.value,
      path: group.path,
      matchCount: group.matchCount,
      matches: group.matches.map((match) => ({
        ordinal: match.ordinal,
        line: match.line,
        column: match.column,
        from: match.from,
        to: match.to,
        lineText: match.lineText,
        matchText: match.matchText,
        groups: [...match.groups],
        ...(match.named ? { named: { ...match.named } } : {}),
      })),
    })),
    totalMatches: result.totalMatches,
    returnedMatches: result.returnedMatches,
    capped: result.capped,
    skippedFiles: result.skippedFiles,
  };
}

/**
 * Registers the project-wide find/replace endpoints:
 *   - `POST /projects/:projectId/search` — read-only scan across every text file.
 *
 * Authorization lives in the use cases (security constitution: no route-level
 * permission check) — search requires project membership. Both routes fan out
 * over the whole project, so each opts into a config-driven per-route rate
 * limit; search gets the higher read budget.
 */
export async function projectSearchRoutes(app: FastifyInstance): Promise<void> {
  const searchRateLimit = {
    max: app.config.project.search.rateLimitMax,
    timeWindow: app.config.project.search.rateLimitWindow,
  };

  app.post<{ Params: { projectId: string }; Body: SearchRequestBody }>(
    '/projects/:projectId/search',
    {
      config: { rateLimit: searchRateLimit },
      schema: {
        params: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['query', 'mode', 'caseSensitive', 'wholeWord'],
          properties: {
            query: { type: 'string', minLength: 1, maxLength: app.config.project.search.maxPatternLength },
            mode: { type: 'string', enum: ['literal', 'regex'] },
            caseSensitive: { type: 'boolean' },
            wholeWord: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);

      const useCase = new SearchProjectContentUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.stores.fileStore,
        request.server.stores.regexEngine,
        // Scan live Yjs content for files open in a collab room so unsaved edits are searchable.
        request.server.repos.document,
        request.server.stores.collaborativeContentEditor,
        requestLogger(request),
      );

      const result = await useCase.execute(actorId, projectId, {
        query: toDomainQuery(request.body),
        limits: {
          maxMatchesReturned: app.config.project.search.maxMatchesReturned,
          perFileTimeBudgetMs: app.config.project.search.perFileTimeBudgetMs,
          maxFileBytes: app.config.project.search.maxFileBytes,
        },
      });

      if (!result.success) {
        if (result.error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
        }
        if (result.error instanceof ValidationError) {
          return reply.status(400).send({ error: { code: 'INVALID_PATTERN', message: result.error.message } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to search project' } });
      }

      return reply.status(200).send({ data: toResultDto(result.value) });
    },
  );

  const replaceRateLimit = {
    max: app.config.project.search.replaceRateLimitMax,
    timeWindow: app.config.project.search.replaceRateLimitWindow,
  };
  const maxPatternLength = app.config.project.search.maxPatternLength;

  app.post<{ Params: { projectId: string }; Body: ReplaceRequestBody }>(
    '/projects/:projectId/replace',
    {
      config: { rateLimit: replaceRateLimit },
      schema: {
        params: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['query', 'replacement', 'scope', 'files'],
          properties: {
            query: {
              type: 'object',
              required: ['query', 'mode', 'caseSensitive', 'wholeWord'],
              properties: {
                query: { type: 'string', minLength: 1, maxLength: maxPatternLength },
                mode: { type: 'string', enum: ['literal', 'regex'] },
                caseSensitive: { type: 'boolean' },
                wholeWord: { type: 'boolean' },
              },
            },
            replacement: { type: 'string', maxLength: maxPatternLength },
            scope: { type: 'string', enum: ['match', 'file', 'project'] },
            files: {
              type: 'array',
              items: {
                type: 'object',
                required: ['fileNodeId', 'selections'],
                properties: {
                  fileNodeId: { type: 'string' },
                  selections: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['ordinal', 'expectedText'],
                      properties: {
                        ordinal: { type: 'integer', minimum: 0 },
                        expectedText: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const actorId = UserId.create(getAuthenticatedUserId(request));
      const projectId = ProjectId.create(request.params.projectId);

      const useCase = new ReplaceProjectContentUseCase(
        request.server.repos.projectMember,
        request.server.repos.fileNode,
        request.server.stores.fileStore,
        request.server.repos.auditLog,
        request.server.stores.regexEngine,
        request.server.stores.structuredCollaborativeEditor,
        request.server.repos.document,
        requestLogger(request),
      );

      const result = await useCase.execute(
        actorId,
        projectId,
        toReplaceInput(request.body),
        requestContextFrom(request),
      );

      if (!result.success) {
        if (result.error instanceof PermissionDeniedError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: result.error.message } });
        }
        if (result.error instanceof ValidationError) {
          return reply.status(400).send({ error: { code: 'INVALID_PATTERN', message: result.error.message } });
        }
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to replace project content' } });
      }

      return reply.status(200).send({ data: toReplaceResultDto(result.value) });
    },
  );
}
