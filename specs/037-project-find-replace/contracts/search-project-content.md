# Contract: Search Project Content

**Route**: `POST /projects/:projectId/search`
**Handler**: `apps/api/src/routes/projects/search.ts`
**Use case**: `SearchProjectContentUseCase` (`packages/domain/src/use-cases/content/search-project-content.ts`)

## Authorization (in the use case, not the route)

- Requires **project membership** (`projectMemberRepo.findByCompositeKey`). Non-member → `PermissionDeniedError` → **403**.
- No route-level permission check (security constitution: RBAC in domain).

## Rate limiting

- `config: { rateLimit: { max: config.project.search.rateLimitMax, timeWindow: config.project.search.rateLimitWindow } }`.
- Amplifying/fan-out route → limit is **mandatory** and **config/env-driven**. Exceeding → **429**.

## Request (Fastify schema-validated)

```
params:  { projectId: string }
body: {
  query: string          # minLength 1, maxLength = config.project.search.maxPatternLength
  mode: 'literal' | 'regex'
  caseSensitive: boolean
  wholeWord: boolean
}
```

## Layering

The route validates the request DTO, **maps `SearchQueryDto` → the domain `SearchQuery`**, calls the use case, and **maps the domain `SearchResult` → `SearchResultDto`** for the response (mirroring how `refactoring.ts` maps `ReferenceUsage`). `packages/domain` never imports the shared DTOs.

## Behavior

1. Authorize (member).
2. List project file nodes; keep those that are files and pass `isSearchableTextFile` (content-decodable; excludes binary — FR-003b). Files over `maxFileBytes` are skipped and counted.
3. For each file, read **live-or-stored** content via `resolveFileContent`/`liveContentDeps` (live Yjs text when a room exists — FR-007).
4. In `mode='regex'`, `regexEngine.compile(query, flags)`; invalid pattern → **400** `{ code: 'INVALID_PATTERN' }` (FR-006b). In `mode='literal'`, no engine.
5. Compute matches with `computeMatches` under the per-file budget (`perFileTimeBudgetMs`). Accumulate the **true total**; include matches up to `maxMatchesReturned`, then set `capped=true` while still counting the total (FR-016).
6. Return `SearchResultDto` (groups ordered by path; matches in document order).

## Responses

| Status | Body |
|---|---|
| 200 | `{ data: SearchResultDto }` |
| 400 | `{ error: { code: 'INVALID_PATTERN', message } }` (regex only) |
| 403 | `{ error: { code: 'FORBIDDEN', message } }` |
| 429 | rate-limit exceeded |
| 500 | `{ error: { code: 'INTERNAL_ERROR', message } }` (no internal detail leaked) |

## Notes

- No content is mutated. Read-only.
- Strictly `projectId`-scoped; never crosses projects (data isolation).
- Worst-case bounded by RE2 linearity + per-file budget → cannot hang or starve other collaborators (SC-008).
