# Contract: Replace Project Content

**Route**: `POST /projects/:projectId/replace`
**Handler**: `apps/api/src/routes/projects/search.ts`
**Use case**: `ReplaceProjectContentUseCase` (`packages/domain/src/use-cases/content/replace-project-content.ts`)

## Authorization (in the use case, not the route)

- Requires **editor or owner** role (`projectMemberRepo` + role check). Otherwise `PermissionDeniedError` → **403**, and the denial is audit-logged (`recordAuthorizationDenial`).

## Rate limiting

- `config: { rateLimit: { max: config.project.search.replaceRateLimitMax, timeWindow: config.project.search.replaceRateLimitWindow } }` — conservative write budget, config/env-driven. Exceeding → **429**.

## Request (Fastify schema-validated)

```
params: { projectId: string }
body: {
  query: SearchQueryDto              # re-evaluated server-side against LIVE content
  replacement: string                # literal, or $1/${name}/$$ template in regex mode; maxLength bounded
  scope: 'match' | 'file' | 'project'
  files: [ { fileNodeId: string, selections: [ { ordinal: number, expectedText: string } ] } ]
}
```

## Layering

The route validates the request DTO, **maps `ReplaceRequestDto` → domain input** (`SearchQuery` + `FileReplaceSelection[]`), calls the use case, and **maps the domain `ReplaceOutcome` → `ReplaceResultDto`**. `packages/domain` never imports the shared DTOs.

## Behavior

1. Authorize (editor/owner).
2. In `mode='regex'`, compile the pattern (invalid → **400** `INVALID_PATTERN`); validate the replacement template references only existing capture groups (FR-006d) → invalid → **400** `INVALID_REPLACEMENT`.
3. For each requested file (bounded by `scope`), resolve its `Document`. Apply via `StructuredCollaborativeEditor.applyStructuredReplacement(projectId, yjsStateId, spec)`:
   - The collab side **re-matches live content in a Yjs transaction** and rewrites only the confirmed spans whose live text still equals `expectedText` (FR-011, FR-017).
   - `applied === 0` for a file → live diverged; record `skipped: { reason: 'diverged' }`, do **not** force a file write.
   - A file with no `Document` record → fall back to `fileStore.write` (rare; never-opened files).
4. Aggregate counts; record `AUDIT_PROJECT_CONTENT_REPLACED { scope, mode, replacedCount, affectedFiles }`.
5. Return `ReplaceResultDto`.

## Responses

| Status | Body |
|---|---|
| 200 | `{ data: ReplaceResultDto }` |
| 400 | `{ error: { code: 'INVALID_PATTERN' | 'INVALID_REPLACEMENT', message } }` |
| 403 | `{ error: { code: 'FORBIDDEN', message } }` |
| 429 | rate-limit exceeded |
| 500 | `{ error: { code: 'INTERNAL_ERROR', message } }` |

## Guarantees

- **Single Yjs-authoritative write path** — open sessions get the edit live; dormant files are loaded from Yjs state, edited, written back, and unloaded (FR-010, FR-011). The 409-guarded plain save path is never used.
- **Stale-safe & merge-safe** — concurrent edits are preserved; vanished matches are skipped and reported (FR-017), never failing the whole operation.
- **No cross-file atomic rollback** — undo is per-file via each document's editor history (FR-018).
- Strictly `projectId`-scoped.
