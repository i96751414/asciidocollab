import type { FastifyInstance } from 'fastify';
import {
  SearchProjectContentUseCase,
  UserId,
  ProjectId,
  PermissionDeniedError,
  ValidationError,
} from '@asciidocollab/domain';
import type { SearchQuery, SearchResult } from '@asciidocollab/domain';
import type { SearchMode, SearchResultDto } from '@asciidocollab/shared';
import { getAuthenticatedUserId } from '../../plugins/require-auth';
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

/** Maps the domain result to the response DTO (value objects → primitives). */
function toResultDto(result: SearchResult): SearchResultDto {
  return {
    groups: result.groups.map((group) => ({
      fileNodeId: group.fileNodeId.value,
      path: group.path,
      matchCount: group.matchCount,
      matches: group.matches.map((match) => ({ ...match })),
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
}
