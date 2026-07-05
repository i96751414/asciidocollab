# Domain-Owned Contracts (No shared DTOs in the Domain) Migration Plan

## Current State

The feature's `data-model.md` defines the search/replace contracts as **shared DTOs**
(`SearchQueryDto`, `SearchMatchDto`, `FileMatchGroupDto`, `SearchResultDto`,
`ReplaceRequestDto`, `FileReplaceSelectionDto`, `ReplaceResultDto`) in
`packages/shared`, and then references some of them **directly inside domain ports and
use cases** — e.g. `StructuredReplacementSpec { query: SearchQueryDto, ... }` and the
search/replace use-case signatures.

```
packages/shared  ──(SearchQueryDto, …)──►  packages/domain  (ports + use cases)
        ▲                                          │
        └───────────── would require: domain depends on shared ◄──── DEPENDENCY BREACH
```

### Problems
- `packages/domain` currently depends on **only** `@asciidocollab/asciidoc-core`. Importing
  shared DTOs adds a `domain → @asciidocollab/shared` dependency, violating the Architecture
  Constitution's inward dependency rule ("packages/domain … apart from asciidoc-core, no other
  package may inject dependencies into it").
- It diverges from the established precedent: existing project-wide operations keep their
  contracts **domain-owned** (`ReferenceUsage` in `find-references.ts`, `ContentReplacement`
  in the `collaborative-content-editor` port) and map to HTTP DTOs at the route.
- It couples the domain's stable business contract to a transport DTO shape, so a wire-format
  change would ripple into the domain.

## Target State

Domain owns its own contract types; `packages/shared` DTOs describe only the HTTP boundary;
the API route maps between them (exactly as `refactoring.ts` maps `ReferenceUsage` → response).

```
packages/domain (SearchQuery, SearchMatch, FileReplaceSelection, StructuredReplacementSpec — domain types)
        ▲                                   │ returns/accepts domain types
        │ asciidoc-core only                ▼
apps/api route  ── maps domain ⇄ SearchQueryDto/… (packages/shared) ──►  web client
```

### Benefits
- Keeps `packages/domain` free of any dependency but `asciidoc-core` (dependency rule intact).
- Matches the in-repo pattern (`ReferenceUsage`/`ContentReplacement`) — reviewers read one idiom.
- Decouples business contract from wire format; the DTO can evolve without touching domain.

## Migration Phases

### Phase 1: Define domain-owned types (Estimated: 0.5 day)
**Goal**: The domain has its own query/match/selection/spec types, no shared import.

- **Task 1.1**: Add domain types next to their consumers — `SearchQuery`, `SearchMatch`,
  `FileMatchGroup`, `SearchResult` in `search-project-content.ts`; `FileReplaceSelection`,
  `ReplaceOutcome` in `replace-project-content.ts`; keep `StructuredReplacementSpec` in
  `ports/storage/structured-collaborative-editor.ts` referencing the domain `SearchQuery`
  (not `SearchQueryDto`).
- **Task 1.2**: Keep the shared `project-search.dto.ts` / `project-replace.dto.ts` as the
  **HTTP** contract only.

**Coexistence**: Domain types and shared DTOs coexist by design — they are different layers.

### Phase 2: Map at the route boundary (Estimated: 0.5 day)
**Goal**: The API route is the only place the two shapes meet.

- **Task 2.1**: In `apps/api/src/routes/projects/search.ts`, map the validated request DTO →
  domain input, and domain result → response DTO (mirror `refactoring.ts`).
- **Task 2.2**: Confirm `packages/domain/package.json` gains **no** `@asciidocollab/shared`
  dependency; add a `fresh-onion`/lint check if not already enforced.

**Coexistence**: The web client and route keep using shared DTOs unchanged.

## Coexistence Strategy

**Why coexistence?** No big-bang. Domain types and DTOs are meant to live side by side across
the boundary; only the *import direction* is corrected.

**How**:
- Domain code uses domain types immediately.
- The route adapts domain ⇄ DTO in one mapping function per endpoint.
- The web client and DTOs are untouched.

## Rollback Plan

The change is confined to type definitions and one mapping layer per route, all pre-implementation.
Revert by restoring the DTO references in the domain files; no runtime/data impact (nothing shipped).

## Success Criteria
- [ ] `packages/domain` depends only on `@asciidocollab/asciidoc-core` (no `@asciidocollab/shared`).
- [ ] Search/replace use cases and ports reference domain-owned types only.
- [ ] `apps/api` route maps domain ⇄ shared DTOs; web client/DTOs unchanged.
- [ ] Tests pass; no behavior change.
