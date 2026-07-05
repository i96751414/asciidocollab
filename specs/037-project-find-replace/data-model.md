# Phase 1 Data Model: Project-Wide Find and Replace

No database schema change. No migration. Audit adds one string constant.

**Layering (Architecture Constitution).** `packages/domain` owns its business contracts as **domain types** and depends only on `@asciidocollab/asciidoc-core` — it MUST NOT import `@asciidocollab/shared`. The DTOs below are the **HTTP-boundary** shapes only; the API route maps request DTO → domain input and domain result → response DTO (mirroring how `refactoring.ts` maps `ReferenceUsage`). `apps/collab` (delivery) may import the domain types directly, as it already imports `ContentReplacement`/`YjsStateId` from `@asciidocollab/domain`.

## HTTP-boundary DTOs (`packages/shared/src/dtos/`)

Used by the API routes and the web client. Never referenced inside `packages/domain`.

### `project-search.dto.ts`

```
SearchMode        = 'literal' | 'regex'

SearchQueryDto {
  query: string            // 1..maxPatternLength
  mode: SearchMode
  caseSensitive: boolean
  wholeWord: boolean       // ignored/false in regex mode (use \b in the pattern)
}

SearchMatchDto {
  ordinal: number          // 0-based index of this match within its file (identity for replace)
  line: number             // 1-based line of the match start (for display + navigation)
  column: number           // 1-based column of the match start
  from: number             // char offset in the file at scan time (navigation only; NOT used to apply)
  to: number
  lineText: string         // the match's line, for the context snippet
  matchText: string        // exact matched substring (= expectedText for the replace selection)
}

FileMatchGroupDto {
  fileNodeId: string
  path: string             // project-relative, no leading slash
  matchCount: number       // matches in this file (may exceed matches.length when capped)
  matches: SearchMatchDto[]
}

SearchResultDto {
  groups: FileMatchGroupDto[]
  totalMatches: number     // TRUE total across the project (FR-016)
  returnedMatches: number  // number actually included (<= maxMatchesReturned)
  capped: boolean          // true when returnedMatches < totalMatches
  skippedFiles: number     // files excluded by size/binary detection (reported, not silent — FR-016/FR-003b)
}
```

### `project-replace.dto.ts`

```
ReplaceScope = 'match' | 'file' | 'project'

// One file's confirmed selection, concurrency-robust: re-matched against live content at apply.
FileReplaceSelectionDto {
  fileNodeId: string
  // The ordinals (within this file, from the search that produced them) to replace,
  // each paired with the exact text expected at that ordinal. A live mismatch => skip (FR-017).
  selections: { ordinal: number; expectedText: string }[]
}

ReplaceRequestDto {
  query: SearchQueryDto      // re-evaluated server-side against live content
  replacement: string        // literal text, or a capture-group template in regex mode ($1, ${name}, $$)
  scope: ReplaceScope        // 'match'|'file'|'project' — bounds which selections are honored
  files: FileReplaceSelectionDto[]
}

ReplaceResultDto {
  replacedCount: number      // total occurrences actually replaced
  affectedFiles: number
  skipped: { fileNodeId: string; reason: 'stale' | 'diverged' | 'not-editable' }[]  // FR-017
}
```

## Domain-owned contracts (`packages/domain/src/…`)

Business types the domain owns; **no `@asciidocollab/shared` import**. The API route maps the DTOs above to/from these. Follow the existing precedent — define each type alongside its consumer (`ReferenceUsage` lives in `find-references.ts`; `ContentReplacement` in the collaborative-content-editor port), not in a shared package.

```
SearchQuery         { text: string; mode: 'literal' | 'regex'; caseSensitive: boolean; wholeWord: boolean }
SearchMatch         { ordinal; line; column; from; to; lineText; matchText }
FileMatchGroup      { fileNodeId; path; matchCount; matches: SearchMatch[] }
SearchResult        { groups: FileMatchGroup[]; totalMatches; returnedMatches; capped; skippedFiles }
FileReplaceSelection{ fileNodeId; selections: { ordinal: number; expectedText: string }[] }
ReplaceOutcome      { replacedCount; affectedFiles; skipped: { fileNodeId; reason }[] }
```

- `SearchQuery`/`SearchMatch`/`FileMatchGroup`/`SearchResult` live in `use-cases/content/search-project-content.ts`.
- `FileReplaceSelection`/`ReplaceOutcome` live in `use-cases/content/replace-project-content.ts`.
- The shared `*.dto.ts` above are the wire shapes only; the route does the mapping.

## Domain ports

### `regex-engine.ts` (NEW) — `packages/domain/src/ports/text/regex-engine.ts`

A stateless text-processing service port — grouped under a new `ports/text/` folder, **not** `ports/storage/` (which holds persistence contracts).

```
RegexFlags { caseSensitive: boolean; multiline: boolean }

CompiledMatcher {
  // Bounded iteration: stops when budget signals abort or when maxMatches reached.
  matches(input: string, budget: MatchBudget): MatchSpan[]   // linear-time, no backtracking
}

MatchSpan { from: number; to: number; groups: (string | undefined)[] }

RegexEngine {
  compile(pattern: string, flags: RegexFlags): Result<CompiledMatcher, ValidationError>  // invalid => ValidationError (FR-006b)
}
```

- Implemented by `Re2RegexEngine` (infrastructure) — **linear-time guarantee** (FR-006a, SC-008).
- In-memory fake for domain tests (deterministic, no RE2 dependency in the domain test tree).

### `structured-collaborative-editor.ts` (NEW) — `packages/domain/src/ports/storage/structured-collaborative-editor.ts`

A content-mutation contract, so it stays under `ports/storage/` (sibling of `collaborative-content-editor`). It references the **domain** `SearchQuery` (not `SearchQueryDto`).

```
StructuredReplacementSpec {
  query: SearchQuery        // domain-owned type; the route maps SearchQueryDto -> SearchQuery
  replacement: string
  selections: { ordinal: number; expectedText: string }[]   // for THIS document (already filtered by scope)
}

StructuredCollaborativeEditor {
  // Re-matches live content in a Yjs transaction and rewrites the confirmed spans.
  // Returns occurrences actually replaced (0 => live diverged; caller does NOT force a file write).
  applyStructuredReplacement(
    projectId: ProjectId, yjsStateId: YjsStateId, spec: StructuredReplacementSpec,
  ): Promise<Result<number, Error>>
}
```

- Implemented by `HttpStructuredCollaborativeEditor` (infrastructure) → collab internal endpoint.
- In-memory fake for domain tests (operates on a plain string map, mirroring live semantics incl. stale-skip).

## Domain value object (`packages/domain/src/value-objects/files/`)

### `searchable-text-file.ts` (NEW)

- `isSearchableTextFile(name, sampleBytes): boolean` — content-decodability predicate (FR-003b): a file node of type `file` whose sampled bytes decode as text (no NUL byte / valid UTF-8 heuristic). Extension-independent. Binary/attachments → false.

## Pure shared helper (`packages/domain/src/use-cases/content/text-match.ts`)

Single source of truth for match semantics, used by both the search use case and the structured apply so they never diverge (mirrors `content-replacements.ts`):

- `computeMatches(content, query, engine?, budget): MatchSpan[]` — literal (with case/whole-word) or regex (via injected engine); respects the per-file budget.
- `substitute(matchText, groups, replacement, mode): string` — literal replacement, or capture-group template expansion in regex mode (`$1`, `${name}`, `$$`), with references to absent groups rejected (FR-006d).
- `selectSpans(spans, selections): {span, replacementText}[]` — filters spans to the confirmed `{ordinal, expectedText}` set, skipping ordinals whose live text ≠ expectedText (FR-017), and produces right-to-left positional edits.

## Entities / audit

- `AUDIT_PROJECT_CONTENT_REPLACED = 'project.content_replaced'` — new string constant in `packages/domain/src/audit-actions.ts`. Payload: `{ scope, mode, replacedCount, affectedFiles }`. No file content, no secrets (security constitution: redaction).

## State & lifecycle

- **Search** is stateless server-side (pure scan → result). Client holds query + results + per-match selection.
- **Replace** lifecycle per file: `confirmed selection → re-match live (in Yjs tx) → apply spans → writeback` or `skip (stale/diverged/not-editable)`. Atomic per file (one Yjs transaction); no cross-file atomicity (D6).
- **Undo**: per-file via each document's editor undo history (FR-018).
