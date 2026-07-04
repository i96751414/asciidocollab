# Phase 1 Data Model: In-Editor Symbol Rename Refactor Suggestion

Most state is **transient client-side editor state**; no new persistent tables. The only persistent side effects are the document rewrites and the audit-log entry, both produced by the reused `RenameSymbolUseCase`.

## Client-side (editor) entities

### SymbolKind
Enumeration of supported symbol kinds.
- `anchor` — explicit anchor/ID (`[[id]]`, `[#id]`, `anchor:id[]`)
- `attribute` — attribute definition (`:name:` / `:name!:`)
- `heading` — section heading whose auto-generated ID is the reference target (no explicit ID)

### RenameCandidate (transient)
Captured when the author edits a definition.
| Field | Type | Notes |
|-------|------|-------|
| `kind` | SymbolKind | classification of the edited definition |
| `oldName` | string | name at edit-start (baseline, FR-002) |
| `newName` | string | current name after edits |
| `definitionRange` | {from,to} | location of the definition token in the current document |
| `fileNodeId` | string | file containing the definition |

Validity rules: `newName` must be a well-formed symbol name for `kind` and length ≤ 200 (FR/IX). A candidate is *actionable* only if `newName !== oldName`, `newName` is valid, and `oldName` has ≥1 other occurrence project-wide (FR-003), and `newName` does not collide with an existing same-kind symbol (FR-022).

### RenameSuggestion (transient, view state)
Derived from an actionable candidate + the usage lookup.
| Field | Type | Notes |
|-------|------|-------|
| `candidate` | RenameCandidate | source candidate |
| `usageCount` | integer | other occurrences (references + other defs) |
| `fileCount` | integer | distinct files affected |
| `status` | enum | `pending` \| `visible` \| `leaving` \| `blocked-collision` \| `dismissed` |
| `collision` | boolean | true → apply blocked, warn shown (FR-022) |

State transitions (timing/location — FR-010–FR-016):
- `(editing)` → after 2s settle with actionable candidate → `visible`
- `visible` → name changes again → back to settle (withdraw/refresh), reappears `visible` 2s after next stop
- `visible` → cursor leaves definition region → `leaving` (start 5s timer)
- `leaving` → cursor returns within 5s → `visible` (cancel timer)
- `leaving` → 5s elapses → `dismissed`
- any → name reverts to `oldName` / apply completes / no more occurrences → `dismissed`
- actionable but `newName` collides → `blocked-collision`

### RefactorResult (transient)
Returned to the editor after apply.
| Field | Type | Notes |
|-------|------|-------|
| `rewrittenReferences` | integer | total usages rewritten |
| `rewrittenFiles` | integer | files changed |
| `skipped` | array | files not updated (conflict/write failure) with reason (FR-019) |
| `undoToken` | opaque | handle to invoke the single-step inverse rename (FR-020) |

## Reused domain/server entities (unchanged, referenced for context)

### SymbolUsage (existing — `apps/web/src/lib/api/projects.ts`)
`{ fileNodeId, path, kind, range:{from,to} }` — returned by `symbol-usages`.

### RenameSymbolResult (existing)
`{ rewrittenFiles, warnings }` — returned by `symbol-rename`; drives `RefactorResult` above.

### AuditLog entry (existing, unchanged)
`AUDIT_SYMBOL_RENAMED { symbolKind, oldName, newName, rewrittenFiles }` emitted by `RenameSymbolUseCase` on apply; authorization denials also audit-logged. The heading-ID extension MUST keep emitting this.

## Configuration entity (new)

### ProjectConfig.refactoring (extended — `apps/api/src/config/schema-project.ts`)
| Field | Default | Env | Purpose |
|-------|---------|-----|---------|
| `rateLimitMax` | 60 | `…_REFACTORING_RATE_LIMIT_MAX` | existing — apply (symbol-rename) budget |
| `rateLimitWindow` | 3600000 | `…_REFACTORING_RATE_LIMIT_WINDOW` | existing |
| `suggestionRateLimitMax` | 600 | `…_REFACTORING_SUGGESTION_RATE_LIMIT_MAX` | **new** — detection (symbol-usages) budget |
| `suggestionRateLimitWindow` | 3600000 | `…_REFACTORING_SUGGESTION_RATE_LIMIT_WINDOW` | **new** |
