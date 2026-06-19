# Implementation Plan: Cross-Document Attribute Resolution & Editor State Memory

**Branch**: `027-cross-document-attributes` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-cross-document-attributes/spec.md`

## Summary

Make the AsciiDoc HTML preview and the editor honor attributes across the whole `include::` tree, rooted at the project's existing **main file** setting (`Project.mainFileNodeId`). A non-root file is previewed/highlighted using the attribute context in effect at its **first** inclusion point in the root. On top of this resolution model the feature closes a set of AsciiDoc fidelity gaps in the preview (conditional directives, partial includes by `tags`/`lines`, `idprefix`/`idseparator`, `xrefstyle`, the full caption/label/signifier family, `sectnums`/`toc`, inline `{set:}`, wrapping attribute values, STEM math, bibliography/index/counters/page-breaks) and in the editor (cross-document attribute highlighting, role/inline-style highlighting with an extensible registry, full constrained/unconstrained boundary rules, xref target/label and table `cols` highlighting, dimmed inactive conditional branches). Separately, it remembers each user's last cursor line **per file** (not just the last-opened file).

Technical approach: extend the already-existing client include-graph model (`apps/web/src/lib/asciidoc/extraction.ts` → `buildIncludeGraphWithInheritance`) and its domain mirror; seed Asciidoctor.js in the render worker with the open file's **inherited attributes** + resolved `leveloffset` so its native engine produces correct IDs/xref/captions/numbering/TOC/conditionals; make the in-worker include assembler attribute-, conditional-, and tag/line-aware; render STEM client-side with a bundled math library after sanitization; and grow the per-user `localStorage` cursor store from one entry to a per-file map.

The feature must also keep the **editor section outline** (`asciidoc-outline.ts`, derived from the single authority `computeHeadingLevels` + `inheritedHeadingOffsetFacet`/`refreshHeadingLevelsEffect`) consistent with these changes: effective heading levels must reflect attribute-form and inherited `leveloffset`; heading titles containing `{attr}` must show the resolved value; headings inside inactive conditional branches must be excluded/marked; and the outline must refresh live when the include structure or main-file setting changes (FR-007a/FR-007b). See Decision R11.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19 / Next.js (App Router), Node (workspace via pnpm)

**Primary Dependencies**: Asciidoctor.js 3.0.4 (preview render worker), CodeMirror 6 + Lezer (editor + in-repo `asciidoc.grammar`), DOMPurify (sanitizer), highlight.js (source blocks), Yjs/Hocuspocus (collab), Prisma/PostgreSQL (persistence). **New**: a bundled client-side math renderer (see research → MathJax 3).

**Storage**: PostgreSQL via Prisma for project/main-file config (existing `Project.mainFileNodeId`); browser `localStorage` for per-user editor state (existing pattern, `use-last-selection.ts`). No schema migration required.

**Testing**: Jest (unit/component) + Playwright (e2e) in `apps/web`. Per the user directive: **every new feature has unit tests; every feature that affects other files (cross-include behavior, multi-file navigation) also has Playwright e2e tests.**

**Target Platform**: Modern browsers (web app); preview rendering in a Web Worker, math + sanitize on the main thread.

**Project Type**: Web application (monorepo: `apps/web`, `apps/api`, `apps/collab`; `packages/domain`, `packages/db`, `packages/shared`).

**Performance Goals**: Best-effort live re-resolution; no fixed latency SLA (spec SC-009). Preview/highlighting must reflect changes once they settle with no stale results.

**Constraints**: Sanitization boundary MUST remain intact (Constitution VIII/IX); STEM/math output and assembled includes must pass through the existing sanitizer unchanged. Math renderer must be self-hosted (no CDN/network, no server-side render). Document-style scoping must not leak into app chrome (Constitution VI).

**Scale/Scope**: Multi-file AsciiDoc projects (books/manuals) with nested includes; cycle- and depth-guarded (existing assembler caps depth 64).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Clean Code** | PASS — extends named, documented modules; no magic literals; typed errors for unresolved includes/attrs already present. |
| **II. TDD (NON-NEGOTIABLE)** | PASS — plan mandates red-green: unit tests first for every feature; e2e for cross-file behavior (matches and strengthens user directive). No performance tests (none requested → opt-in per constitution 2.3.0). |
| **III. Seam testing / in-memory fakes** | PASS — pure resolution functions (`buildIncludeGraphWithInheritance`) are tested with in-memory `readContent`/`resolveInclude` fakes (existing pattern); no repository mocking. |
| **IV. Reuse Before Rebuild** | PASS w/ note — math rendering reuses a maintained library (MathJax 3), vendored via dependency, not hand-rolled. The in-repo Lezer grammar is **extended** (no vendorable Lezer AsciiDoc grammar exists) — permitted and documented in research. |
| **V. Theming via Design Tokens** | PASS — any new editor chrome (dimming, registry-driven emphasis) derives from design tokens; works in light/dark. |
| **VI. Style Isolation** | PASS w/ note — math CSS (MathJax stylesheet) is scoped to the preview content container like the vendored Asciidoctor CSS; must not restyle chrome. Tracked as a design task. |
| **VII. Per-User Preferences / Shared Immutability** | PASS — per-file cursor memory is a personal preference (per-user `localStorage`), never mutates shared content. Main-file is project-scoped, permission-gated config (already exists) — explicitly permitted by VII. |
| **VIII. Editor Pipeline Integrity** | PASS w/ justification — this feature **adds inputs** (more attributes seeded, conditionals/tags resolved, math rendered) but keeps the **same DOMPurify boundary**, re-applied. Scroll-sync (`data-source-line`) must be preserved; assembler changes that touch source-line mapping are covered by regression tests. Justification recorded below. |
| **IX. Untrusted Input Boundary (NON-NEGOTIABLE)** | PASS w/ justification — include `tags`/`lines`/conditional targets remain sandbox-confined via existing `resolveSandboxedPath`; `ifeval` is evaluated by Asciidoctor's own safe evaluator (no `eval`); inline `{set:}` values and attribute substitution feed only the sanitized render path; math source is treated as inert and math output passes through the sanitizer. Recorded below. |

**Constitution VIII/IX justification (required call-out):**
- The render worker already assembles includes and re-applies DOMPurify. This feature widens *what is resolved* (inherited attributes, conditionals, tag/line slices) but **routes everything through the existing `assembleIncludes` + DOMPurify path** — the sanitizer is neither forked nor relaxed.
- **Conditionals**: include-gating conditionals are evaluated in the assembler using a minimal, non-`eval` attribute test; content-level `ifdef/ifeval` are left to Asciidoctor's built-in (safe) processor. No arbitrary code execution.
- **Math**: rendered client-side from already-sanitized DOM text nodes; the math library output is inserted into the scoped preview container and the post-render HTML continues through DOMPurify. No external fetch.
- **Scroll-sync**: assembler keeps source-line fidelity; tag/line filtering and conditional stripping must preserve `data-source-line` mapping for retained content — explicit regression tests required (Constitution VIII).

**Result: GATE PASS** (no unjustified violations). Re-evaluated post-design — still PASS (see end).

## Project Structure

### Documentation (this feature)

```text
specs/027-cross-document-attributes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (module + render contracts)
│   ├── resolution-model.md
│   ├── render-worker.md
│   └── cursor-memory.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/web/src/
├── lib/asciidoc/
│   ├── extraction.ts                 # EXTEND: inheritedAttributes already exists; add
│   │                                 #   resolved scope at a position incl. {set:}, wrapping
│   │                                 #   values, unset; expose per-file resolved attribute map
│   ├── include-path.ts               # reuse substitutePathAttributes
│   └── sandbox-path.ts               # reuse resolveSandboxedPath (Constitution IX)
├── lib/codemirror/
│   ├── asciidoc.grammar              # EXTEND: constrained/unconstrained boundaries, role spans,
│   │                                 #   xref target/label, table cols, {set:}, wrapped values
│   ├── asciidoc-block-token-logic.ts # EXTEND: wrapped attribute-value continuation, conditionals
│   ├── asciidoc-highlight-tags.ts    # EXTEND: new token → tag mappings
│   ├── inline-style-registry.ts      # NEW: extensible role/style registry (FR-021c)
│   ├── conditional-dimming.ts        # NEW: live inactive-branch dimming decoration (FR-032)
│   ├── cross-doc-attributes.ts       # NEW: feed resolved cross-file attrs into highlighting (FR-020)
│   ├── asciidoc-heading-levels.ts    # EXTEND: refresh inherited offset on include/main-file change;
│   │                                 #   single authority for effective heading levels (R11)
│   ├── asciidoc-outline.ts           # EXTEND: resolve {attr} in titles; exclude inactive-branch
│   │                                 #   headings; refresh on cross-document change (R11)
│   └── completions/attribute.ts      # reuse/extend for {set:} awareness
├── workers/
│   ├── asciidoc-render.worker.ts     # EXTEND: seed inherited attributes + leveloffset; keep
│   │                                 #   DOMPurify boundary; client math handled in component
│   └── assemble-includes.ts          # EXTEND: attribute-aware; conditionals gating includes;
│   │                                 #   tags=/lines= partial includes; preserve source-line map
├── components/
│   ├── asciidoc-preview.tsx          # EXTEND: invoke client math render post-sanitize, scoped
│   └── math/render-math.ts           # NEW: MathJax integration (self-hosted, scoped)
├── hooks/
│   ├── use-asciidoc-preview.ts       # EXTEND: pass open-file inherited context to worker
│   ├── use-project-symbol-index.ts   # EXTEND: expose resolved attributes per file to editor
│   ├── use-last-selection.ts         # EXTEND → per-file cursor map (FR-022..FR-027)
│   └── use-per-file-cursor.ts        # NEW (or fold into use-last-selection): per-file line store
└── styles/
    └── vendor/                       # math stylesheet vendored + scoped (build step)

packages/domain/src/services/
└── asciidoc-extraction.ts            # KEEP IN SYNC: authoritative mirror of extraction rules

packages/shared/src/                  # DTO shapes for resolved attributes / include edges (if extended)

apps/web/tests/                       # Jest unit/component tests (every feature)
apps/web/e2e/                         # Playwright e2e (every cross-file feature)
```

**Structure Decision**: All work lands in `apps/web` (editor, preview worker, components, hooks) plus the `packages/domain` mirror of extraction rules (kept in sync per the existing contract) and possibly `packages/shared` DTOs. No `apps/api`/`apps/collab`/DB schema changes are required — the main-file setting and per-user state stores already exist.

## Phase 0 / Phase 1 outputs

- Phase 0 research: [research.md](./research.md)
- Phase 1 data model: [data-model.md](./data-model.md)
- Phase 1 contracts: [contracts/](./contracts/)
- Phase 1 quickstart: [quickstart.md](./quickstart.md)

## Complexity Tracking

No constitution violations requiring justification beyond the VIII/IX call-outs above (which are explicitly permitted by the constitution and recorded). No added architectural complexity: the feature extends existing modules rather than introducing new subsystems, except the math renderer (a single reused dependency) and small new editor decoration/registry modules.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1 design: **PASS**. The design keeps the single DOMPurify boundary (VIII/IX), reuses Asciidoctor's native engine and a maintained math library (IV), scopes math styles to the preview container (VI), stores cursor memory as per-user `localStorage` (VII), and introduces no repository mocking (III). The one accepted deviation from the spec's assumptions — cursor memory persists per-browser via `localStorage` rather than server-side/cross-device — is documented in research.md (Decision R8) and does not violate any principle.
