# Contracts: Refactoring Endpoints (reused + extended)

Base: existing `apps/api/src/routes/projects/refactoring.ts`. Authorization lives in the domain use cases (no route-level checks). This feature **reuses** both endpoints and makes two extensions: a new rate-limit budget for detection, and a heading symbol kind for rename.

## GET /projects/:projectId/symbol-usages  (detection — reused, re-budgeted)

Purpose: count/locate all usages of a symbol name project-wide (live-aware). Read-only.

- **Auth**: project membership (403 `FORBIDDEN` otherwise).
- **Query**: `name` (1–200 chars, required), `kind` (`anchor` | `attribute` | `heading`) — `heading` added by this feature.
- **200 response**: `{ data: { usages: [{ fileNodeId, path, kind, range:{from,to} }] } }`
- **Rate limit (CHANGED)**: now bound to `project.refactoring.suggestionRateLimitMax` / `suggestionRateLimitWindow` (default 600/hour) instead of the shared apply budget, because proactive detection fires this route frequently. Exceeding it returns **429**.
- **Notes**: source of truth is live Hocuspocus content for files in a collab room, persisted content otherwise (FR-006a) — already implemented.

## POST /projects/:projectId/symbol-rename  (apply — reused, kind extended)

Purpose: rewrite all usages of `oldName` → `newName` project-wide, across live + persisted files, atomically enough to be undone as one step.

- **Auth**: editor or owner (403 `FORBIDDEN` + audit-logged denial otherwise).
- **Body**: `{ symbolKind: 'anchor' | 'attribute' | 'heading', oldName, newName }` — `heading` added by this feature (renames the heading's derived ID and its xrefs; only valid when the heading has no explicit ID and the derived ID is referenced).
- **200 response**: `{ data: { rewrittenFiles, warnings } }`
- **Validation**: `oldName`/`newName` 1–200 chars; reject when `newName` collides with an existing same-kind symbol (surface so the client keeps apply **blocked**, FR-022).
- **Rate limit (unchanged)**: `project.refactoring.rateLimitMax` / `rateLimitWindow` (default 60/hour). **429** on exceed.
- **Audit (unchanged)**: emits `AUDIT_SYMBOL_RENAMED { symbolKind, oldName, newName, rewrittenFiles }`.
- **Undo**: the single-step undo (FR-020) is realized by invoking the inverse rename (`newName` → `oldName`) over the same file set as one authorized, audited operation.

## Client API (reused — `apps/web/src/lib/api/projects.ts`)

- `findSymbolUsages(projectId, name, kind)` → `SymbolUsage[]`  (extend `kind` union with `heading`)
- `renameSymbol(projectId, { symbolKind, oldName, newName })` → `RenameSymbolResult`  (extend `symbolKind` with `heading`)

## Config contract (new — `apps/api/src/config/schema-project.ts` + `apps/api/config/default.yaml`)

```yaml
project:
  refactoring:
    rateLimitMax: 60
    rateLimitWindow: 3600000
    suggestionRateLimitMax: 600         # NEW
    suggestionRateLimitWindow: 3600000  # NEW
```

Env overrides: `ASCIIDOCOLLAB_PROJECT_REFACTORING_SUGGESTION_RATE_LIMIT_MAX`, `ASCIIDOCOLLAB_PROJECT_REFACTORING_SUGGESTION_RATE_LIMIT_WINDOW`. Both documented with defaults; never hardcoded literals in the route.
