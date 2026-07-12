# Package↔App Boundary (Include-Assembly Reuse) Migration Plan

Scope of this plan: the one architectural item in feature 039 that requires **relocating an existing
module** with coexistence implications — the reuse of include-assembly logic by the new
`packages/asciidoc-pdf` package. (The other two refactor tasks — typed wasm-bridge adapter, boundary
enforcement for the new package — are localized and do not need a phased migration.)

> Not covered here: the Ruby-sidecar → ruby.wasm **Technology Mandate** change. That is a
> Constitution Update Proposal handled by `architecture-review`/`architecture-apply`, not a refactor.

## Current State

```
apps/web/src/workers/assemble-includes.ts   ← assembleIncludes() lives inside the APP
        │  depends on
        ├─ @asciidocollab/asciidoc-core      (shared, inward — OK)
        └─ apps/web/src/lib/asciidoc/*        (sandbox-path, include-path — APP-local)

Feature 039 plan (T025) wants:
packages/asciidoc-pdf/src/pipeline/stages/include-resolve.ts  ──imports──▶  apps/web/...assemble-includes.ts
        └──────────────── PACKAGE importing from APP ──────────────┘   ✗ outward dependency
```

### Problems

- A `packages/*` module importing from an `apps/*` module **inverts the dependency rule**
  (`Domain ← Application ← Infrastructure ← Delivery`; apps are delivery/outermost). Packages must
  not depend on apps.
- It couples the environment-agnostic PDF engine to Next.js app code, breaking the plan's own
  "environment-agnostic orchestrator, unit-testable with in-memory fakes" goal (Principle III).
- `assembleIncludes` also reaches into `apps/web/src/lib/asciidoc/*` (sandbox-path), which would drag
  more app-local code across the boundary.

## Target State

```
packages/asciidoc-core (or new packages/asciidoc-assembly)   ← shared assembly primitive (inward)
        ▲                                   ▲
        │ depends inward                     │ depends inward
apps/web/src/workers/assemble-includes.ts    packages/asciidoc-pdf/src/pipeline/stages/include-resolve.ts
   (thin app wrapper: injects readFile +      (uses the shared primitive via an injected
    app sandbox-path, calls shared core)       IncludeAssembler port — no app import)
```

Two acceptable target shapes (pick during Phase 1 based on how app-coupled `assembleIncludes` is):

- **A — Relocate**: move the environment-agnostic assembly logic into a shared package
  (`asciidoc-core` or a new `packages/asciidoc-assembly`), keeping I/O (`readFile`) and the
  sandbox-path policy as **injected parameters**. Both `apps/web` and `packages/asciidoc-pdf` depend
  inward on it.
- **B — Invert**: define an `IncludeAssembler` **port** in `packages/asciidoc-pdf` (like the existing
  `RenderShim`/`readFile` seams); `apps/web`'s PDF worker supplies the concrete assembler at the
  composition root. The package never imports the app.

Prefer **A** if the assembly logic is genuinely shared (it is — HTML preview and PDF both need it);
fall back to **B** if relocation is too invasive for v1.

### Benefits

- Restores the inward-only dependency rule; `packages/asciidoc-pdf` stays app-free and unit-testable
  with in-memory fakes.
- Single source of truth for include semantics (tags/lines/leveloffset/conditional gating) shared by
  the HTML preview and the PDF pipeline — no drift between the two rendering paths.

## Migration Phases

### Phase 1: Extract the shared primitive (Estimated: 1 day)
**Goal**: An environment-agnostic assembly function with I/O and sandbox-path injected.

- **Task 1.1**: Identify the app-coupled parts of `apps/web/src/workers/assemble-includes.ts`
  (`readFile`, `resolveSandboxedPath`) and lift them to parameters/ports.
- **Task 1.2**: Place the pure logic in the shared package (target A) or define the `IncludeAssembler`
  port in `packages/asciidoc-pdf` (target B). No behavior change.

**Coexistence**: The existing `apps/web` `assemble-includes.ts` stays in place and keeps serving the
HTML preview unchanged — it now calls the shared primitive (A) or is left untouched (B).

### Phase 2: Consume from the PDF pipeline (Estimated: 0.5 day)
**Goal**: `include-resolve.ts` uses the shared primitive / injected port — zero `apps/web` imports.

- **Task 2.1**: Implement `packages/asciidoc-pdf/src/pipeline/stages/include-resolve.ts` against the
  shared primitive/port; inject the sandbox-path policy and `readFile` at the worker composition root.
- **Task 2.2**: Add an import-boundary assertion (fresh-onion / lint) that fails if
  `packages/asciidoc-pdf` imports from `apps/*`.

**Coexistence**: HTML preview and PDF export both run on the shared primitive; no big-bang cutover.

## Coexistence Strategy

**Why coexistence?** The HTML preview already ships on `assembleIncludes`; we must not regress it
while adding the PDF path.

**How**:
- New code (`include-resolve.ts`) uses the shared primitive/port immediately.
- The existing app wrapper continues to serve HTML preview, now delegating to the same primitive.
- The sandbox-path policy is passed in at the boundary, so app and package can use their respective
  resolvers without cross-importing.

## Rollback Plan

If extraction destabilizes the HTML preview: revert `apps/web/assemble-includes.ts` to its
pre-migration copy (kept in git history), and temporarily have `include-resolve.ts` accept the
**already-assembled document** as input (produced app-side) — still no package→app import — until the
shared primitive is re-attempted.

## Success Criteria

- [ ] `packages/asciidoc-pdf` has zero imports from `apps/*` (enforced by the import-boundary check).
- [ ] Include semantics (tags/lines/leveloffset/conditional gating) are single-sourced.
- [ ] HTML preview include behavior is unchanged (existing tests green).
- [ ] PDF include-resolve is unit-testable with in-memory `readFile` fakes.
- [ ] No performance regression in the HTML preview path.
