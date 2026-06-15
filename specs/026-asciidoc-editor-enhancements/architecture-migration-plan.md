# Shared AsciiDoc Structural Model — Migration Plan

Non-blocking. Addresses architectural drift introduced by US8 (client symbol index) and US12 (domain `FindReferencesUseCase`) defining/parsing the same AsciiDoc concepts (references, symbols, include resolution, sandbox path rules) in two layers. Goal: one canonical contract + pure logic in `packages/shared`, with the editor keeping a fast client-side **projection** — not a second source of truth.

## Current State

```
apps/web  ── asciidoc-symbol-index.ts ──┐  parses references/symbols, builds include graph,
                                        │  resolves include/image paths, computes leveloffset
packages/domain ── FindReferencesUseCase ┘  parses references again (separate impl/types)
apps/web/workers ── render include resolver  resolves include paths (third path-resolution impl)
data-model.md ── Reference/ProjectSymbol/Diagnostic defined as web-only entities
```

### Problems
- The same "what is a reference / symbol / valid include path" logic is implemented in `apps/web` and `packages/domain` (Constitution: "No two packages MAY independently define the same type"; Reuse Before Rebuild).
- Sandbox include/image path-resolution (Constitution IX) is implemented in three places (client index, render worker, domain move/rename) — they can drift, weakening the security boundary.
- `Reference`/`ProjectSymbol`/`Diagnostic` shapes are declared client-side but are also produced by a domain use case that the web consumes → divergent definitions across the boundary.

## Target State

```
packages/shared
  ├── asciidoc-model/        pure: Reference, ProjectSymbol, Diagnostic, IncludeEdge DTOs
  │                          + reference/symbol extraction + effective-level rules (no deps)
  └── project-path/          pure: resolveSandboxedPath() + traversal/remote rejection (Constitution IX)

apps/web/asciidoc-symbol-index.ts   imports shared extraction → builds a client PROJECTION (cache)
packages/domain/FindReferencesUseCase imports shared extraction → canonical, persistence-facing
apps/web/workers/render include resolver  imports shared project-path for resolution
```

### Benefits
- One definition of each cross-boundary shape (shared DTOs).
- One sandbox path-resolution rule → a single enforced security boundary (Constitution IX).
- Editor responsiveness preserved (client projection) without forking the model.

## Migration Phases

### Phase 1: Extract shared contracts (Estimated: 1 day)
**Goal**: Cross-boundary shapes live once.
- **Task 1.1**: Define `Reference`, `ProjectSymbol`, `Diagnostic`, `IncludeEdge` DTOs in `packages/shared/src/asciidoc-model/` (pure types).
- **Task 1.2**: Point data-model.md's client entities at these DTOs; the web index extends them with view-only fields (ranges) rather than redefining.

**Coexistence**: web keeps its own runtime types until Phase 2 swaps them for the shared DTOs; no behavior change.

### Phase 2: Extract shared pure logic (Estimated: 2 days)
**Goal**: One reference/symbol extractor and one effective-level rule.
- **Task 2.1**: Move reference/symbol extraction + leveloffset/effective-level computation into `packages/shared/src/asciidoc-model/` as pure functions (no CodeMirror, no Prisma).
- **Task 2.2**: `apps/web` symbol index and `packages/domain` `FindReferencesUseCase` both call the shared functions; the web layer adds only the CM range/decoration mapping.

**Coexistence**: implement shared functions first; switch the two consumers one at a time; keep the old web parser until its tests pass against the shared one.

### Phase 3: Unify sandbox path resolution (Estimated: 1 day)
**Goal**: One Constitution-IX path rule.
- **Task 3.1**: Add `resolveSandboxedPath()` (reject `..`/absolute/symlink/remote) in `packages/shared/src/project-path/`.
- **Task 3.2**: Use it from the client index, the render worker, and domain move/rename/file-read.

**Coexistence**: route new resolutions through the shared util immediately; replace the three existing inline resolvers incrementally, each behind its own tests.

### Phase 4: Consolidate the effective-level rule (Estimated: 0.5 day)
**Goal**: The `effectiveLevel = raw + in-file leveloffset ops + inherited offset` rule exists once, in shared.

Addresses drift between increments: US3's **in-file** leveloffset computation ships in Increment B
(`apps/web/.../asciidoc-heading-levels.ts`, T024) **before** the shared `asciidoc-model` exists (Phase 13).
The inherited offset is wired from shared in T066, but the in-file "sum of `:leveloffset:` ops in document
order" rule risks being implemented in *both* the web module and shared — contradicting "effective-level
rules exist once" below.

- **Task 4.1**: Move the in-file effective-level computation (raw + document-ordered in-file `:leveloffset:`
  ops, max-level cutoff, discrete recognition) out of `asciidoc-heading-levels.ts` into the shared
  `asciidoc-model` effective-level rule (the same rule that owns the inherited offset).
- **Task 4.2**: Reduce `asciidoc-heading-levels.ts` to a CM projection: call the shared rule and apply the
  per-level style/decoration only — no leveloffset arithmetic in the web layer.

**Coexistence**: in Increment B the web module keeps its own in-file computation (no shared module yet);
when Phase 13 lands, swap it for the shared rule under T066's wiring (the web unit tests for
`asciidoc-heading-levels` then assert against the shared rule). Until the swap, the two share identical
fixtures so behavior cannot diverge silently.

## Coexistence Strategy

**Why coexistence?** Avoid a big-bang rewrite while US8/US12 are still being built.

**How**:
- New code (US8 index, US12 use case, render resolver) imports the shared model/path util from day one.
- The editor keeps a client projection of the model for latency — it is a read-only cache derived from the shared rules, never an independent definition.
- A thin mapping layer in `apps/web` adapts shared DTOs to CM ranges/decorations.

## Rollback Plan
Shared modules are additive and pure. If extraction misbehaves, revert consumers to their inline implementations (kept until each phase's tests are green) — no schema or API change is involved.

## Success Criteria
- [ ] `Reference`/`ProjectSymbol`/`Diagnostic`/`IncludeEdge` defined once, in `packages/shared`.
- [ ] Reference/symbol extraction + effective-level rules exist once, reused by web and domain.
- [ ] One `resolveSandboxedPath()` used by client index, render worker, and domain.
- [ ] Web symbol index is a projection over the shared model (no second parser).
- [ ] Effective-level rule (in-file + inherited leveloffset, cutoff, discrete) exists once in shared; `asciidoc-heading-levels.ts` is a CM projection with no leveloffset arithmetic.
- [ ] Tests pass; no performance regression in the editor.
