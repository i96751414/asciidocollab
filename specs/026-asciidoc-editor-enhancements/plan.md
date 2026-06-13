# Implementation Plan: AsciiDoc Editor Enhancements

**Branch**: `026-asciidoc-editor-enhancements` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/026-asciidoc-editor-enhancements/spec.md`

## Summary

Twelve enhancements to the CodeMirror 6 AsciiDoc editor, spanning a P1 data-loss fix (editor content lost when the preview is toggled) and a near-complete line-wrap toggle, through P2 highlighting/folding completeness, to P3 in-editor intelligence (cross-file reference resolution, diagnostics, completion, refactoring) and authoring conveniences. A source audit (recorded in the spec's *Current Implementation Status*) shows several requirements are partly built and must be **extended/exposed, not rebuilt** — notably the single-file completion engine (US8) and the soft-wrap internals (US2). The technical approach favors **reuse before rebuild** (Constitution IV): extend the existing Lezer grammar, add `@codemirror/lint` for diagnostics, reuse `highlight.js` and/or CM language packages for in-editor source highlighting, and reuse `turndown` (HTML→Markdown) plus a small first-party Markdown-subset mapper for paste-HTML. Per the user's explicit instruction, **every user-facing feature gets a Playwright e2e spec in addition to the TDD unit tests** mandated by Constitution II.

Delivery is split into four independently shippable increments (Constitution "Phased Delivery"): **A** (P1 fixes), **B** (highlighting & folding), **C** (in-editor code, insertion, conveniences, metrics), **D** (cross-file intelligence & refactoring — depends on a new main-file setting + include-graph foundation).

**Cross-increment dependency (heading levels):** US3 has two parts. The in-file portion — per-level styling, `[discrete]` headings, and the effective-level cutoff using **in-file** `:leveloffset:` — ships in **B**. The **inherited** leveloffset (offset accumulated from ancestor files in the include path) and the live refresh when the main file changes (FR-045a/FR-071) depend on the include-graph/symbol index built in **D**; until D lands, heading levels are computed from the current file alone (the FR-047 fallback). This split keeps each increment shippable without a forward dependency.

## Technical Context

**Language/Version**: TypeScript 5.x; React 19 / Next.js 16 (apps/web); Node 20 (apps/api, apps/collab). ESM.

**Primary Dependencies**: CodeMirror 6 (`@codemirror/{view,state,language,autocomplete,commands,search}`), Lezer (`@lezer/{lr,highlight,common,generator}`), Yjs + `y-codemirror.next` + `@hocuspocus/provider` (collab), `asciidoctor` 3 (preview Web Worker), `highlight.js` 11. **New dependencies (to add, justified in research.md):** `@codemirror/lint` (diagnostics), a source-language highlighting mechanism (`@codemirror/language-data` + lazy CM language packages, scoped to a curated set), `turndown` for HTML→Markdown plus a small in-house Markdown-subset→AsciiDoc mapper (no HTML→AsciiDoc asset exists to vendor), a spell-check engine (`nspell` + a dictionary). All new deps evaluated against Constitution IV (reuse) and the security constitution (dependency scanning).

**Storage**: PostgreSQL via Prisma (`packages/db`) — one new nullable field `Project.mainFileNodeId` for the configured main AsciiDoc file (FR-045). Filesystem `ProjectFileStore` for images (FR-040 storage primitive already exists). Per-user editor preferences persist via the existing preferences store (localStorage + API); fold state and spell-check ignore-list are new per-user keys.

**Testing**: Jest (unit; in-memory fakes for domain per Constitution II/III; pure-function tests for grammar tokenization, fold-range computation, completion/diagnostic sources, reference extraction) + Playwright (e2e; **mandatory for every user-facing feature** per user input). Existing e2e suite under `apps/web/e2e/`; isolated local stack via `scripts/e2e-local.sh` / `scripts/e2e-stack-up.sh`.

**Target Platform**: Modern browsers (editor is client-side CodeMirror); Linux server for API/collab.

**Project Type**: Web application — modular monolith with Clean Architecture layering (`apps/{web,api,collab}` + `packages/{domain,application,infrastructure,shared,db}`).

**Performance Goals**: Editor interactions stay responsive on large documents — syntax highlighting and folding incremental; diagnostics, the project symbol index, and document metrics are **debounced and computed off the typing path** (async lint source, idle-time index refresh). Cross-file include-graph/symbol resolution is cached and incrementally invalidated on file-change SSE events, not rebuilt per keystroke.

**Constraints**: Constitution gates (below). Per-user preferences MUST NOT mutate shared content (VII). Preview sanitization and scroll-sync MUST NOT regress (VIII) — relevant because cross-file resolution may need include expansion. New chrome (toggles, palette, diagnostics, metrics) MUST be token-themed, light+dark (V). In-editor source highlighting MUST stay confined to the editor surface (VI). Editor must keep working on the REST/offline path, not only the collab path.

**Scale/Scope**: Documents up to large size (folding/metrics must handle thousands of lines); project file trees with cross-file includes (symbol index spans all `.adoc` files reachable from the main file). 12 user stories, FR-001–FR-067.

## Constitution Check

*GATE evaluated against `.specify/memory/constitution.md` **v2.3.0** and `architecture_constitution.md`. The constitution was amended during this feature: 2.1.0 → 2.2.0 (unblock features + Principle IX security), and 2.2.0 → 2.3.0 (Principle II clarified — performance/load tests are opt-in). Re-checked after Phase 1 (see end of section).*

| Principle | Compliance approach | Status |
|-----------|--------------------|--------|
| **I. Clean Code** | New CM extensions (fold service, lint source, completion sources, highlighters) isolated as small pure modules under `apps/web/src/lib/codemirror/`; typed domain errors for new use cases (set-main-file, rewrite-references). | ✅ |
| **II. TDD (NON-NEGOTIABLE)** *(clarified in 2.3.0)* | Red→green for every unit: grammar token rules, fold-range computation, completion/diagnostic/reference-extraction functions, and all new domain use cases (in-memory fakes). Live-CodeMirror wiring (hard to unit-cover per quality-gates memory) is validated by **Playwright e2e**, which the user additionally mandates for **all** features. **Performance/load tests are opt-in (2.3.0) and not requested for this feature — their absence is not a coverage gap.** | ✅ |
| **III. In-memory fakes** | New domain ports (main-file read/write on Project; project file-content reader for the symbol index/reference rewrite) get in-memory fakes in `packages/domain/tests/ports/`. No mocking of repositories. | ✅ |
| **IV. Reuse Before Rebuild** *(clarified in 2.2.0)* | Diagnostics via `@codemirror/lint`; in-editor source highlighting via maintained CM language packages / `highlight.js`; HTML→AsciiDoc via reused `turndown` (HTML→MD) + a small first-party MD-subset mapper (no HTML→AsciiDoc asset exists to vendor — permitted by clarified IV); spell-check via `nspell` + dictionary; folding via `@codemirror/language` primitives. **Extending the in-repo Lezer grammar (US7) is now explicitly permitted** — the audit confirmed no Lezer/CM-compatible AsciiDoc grammar exists to vendor, which the clarified IV recognizes. | ✅ |
| **V. Theming via Design Tokens** | Line-wrap toggle, go-to-symbol palette, diagnostics gutter/underline colors, metrics in the status bar, and any new menus derive from design tokens; verified in light + dark. | ✅ (design task + e2e visual checks) |
| **VI. Style Isolation** | In-editor source-language highlighting is applied via CM decorations scoped to the editor; it MUST NOT leak into chrome. Preview include-expansion (if added) keeps the existing preview style scoping intact. | ✅ |
| **VII. Per-User Preferences, Shared Content Immutability** *(clarified in 2.2.0)* | Line wrap, fold state, and spell-check ignore-list are **per-user** and never written to document source. The **main-file setting (FR-045) is project-scoped configuration** — the clarified VII now explicitly permits this: stored on the Project, permission-gated, not a user preference. The earlier ⚠️ callout is resolved by the amendment. | ✅ |
| **VIII. Editor Pipeline Integrity (Sanitization & Scroll-Sync)** *(expanded in 2.2.0)* | **No longer scoped away.** The amended VIII permits resolving `include::` into the render path, so **the preview renders the configured main document with includes resolved (new FR-068)** — provided the assembled content passes **unchanged** through the existing sanitizer and satisfies Principle IX (sandbox + validation), and scroll-sync regression tests prove no regression. The editor-side symbol index (completion/validation/nav) remains independent of the render path; the preview-assembly capability is a distinct, security-gated addition in Increment D. | ✅ (delivered under IX gates) |
| **IX. Untrusted Input Boundary (NON-NEGOTIABLE, new in 2.2.0)** | The single enforced security gate for every "richer content" feature: paste-HTML→AsciiDoc is sanitized through the existing sanitizer before insertion (FR-062); image paste/drop validates type+size at the boundary (FR-040); `include::` / `image::` / attribute-substituted path resolution is **confined to the project storage sandbox** — path traversal and remote/external fetches rejected (FR-046/048/058, FR-068); embedded source languages are treated as **inert data**, never executed (FR-017). No feature introduces a parallel/relaxed sanitization path. Each is covered by a security test. | ✅ |

**Architecture constitution**: New domain work (main-file setting, reference rewriting on move/rename, project symbol/reference reading) lives in `packages/domain` use cases + ports with infrastructure implementations; `Result<T,E>` for fallible ops; tests mirror source per the mandated layout; no domain→infrastructure imports. **Cross-boundary AsciiDoc shapes + rules (Reference/ProjectSymbol/Diagnostic/IncludeEdge, reference/symbol extraction, sandbox path resolution) are defined once in `packages/shared`** and reused by both the web editor projection and the domain use cases — satisfying "no two packages define the same type" and Reuse Before Rebuild. The move/rename use case returns a typed `mainFileCleared` outcome (shared DTO), not an ad-hoc signal. The shared-model contracts are a **blocking foundation for Increment D**, built first in Phase 13 (tasks.md) — US8, US12, the US3 inherited-offset wiring, and the preview resolver all import them. The *coexistence/incremental* strategy in `architecture-migration-plan.md` applies to replacing the **existing inline resolvers** (and consolidating the interim in-file effective-level rule, Phase 4), not to building the new shared module. The new `SetProjectMainFileUseCase` enforces project-edit authorization **in the use case** (not the route), mirroring `UpdateProjectUseCase` (security_constitution RBAC-in-domain). ✅

**Constitution amendments (2.1.0 → 2.2.0):** rather than ship a lesser feature to dodge a principle, the constitution was amended (see `.specify/memory/constitution.md` SYNC IMPACT REPORT): IV clarified (extending the in-repo grammar is allowed), VII clarified (project-scoped config is permitted), VIII expanded (resolving/assembling content into the render path is permitted under the sanitizer), and **new NON-NEGOTIABLE Principle IX (Untrusted Input Boundary)** added to enforce security across all the unblocked capabilities. Net effect: features are **unblocked**, security is **strengthened** (one enforced gate instead of per-feature ad-hoc decisions).

**Initial gate: PASS.** No feature is scoped down to avoid a principle; the two former callouts (VII, VIII) are resolved by the amendments; Principle IX is the enforced security counterweight. → proceed to Phase 0.

**Post-Phase-1 re-check: PASS** — main-file is project config (clarified VII); preview include-assembly (FR-068) is delivered under the sanitizer + sandbox (expanded VIII + IX); all externally-sourced content (paste/include/image/paths/embedded langs) flows through the IX boundary; new UI is token-themed. No unjustified violations. Complexity Tracking remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/026-asciidoc-editor-enhancements/
├── plan.md              # This file
├── research.md          # Phase 0 — technology/approach decisions
├── data-model.md        # Phase 1 — entities & state
├── quickstart.md        # Phase 1 — run, validate, gates, e2e
├── contracts/
│   ├── api-main-file.md        # PUT main-file endpoint + Project DTO change
│   ├── editor-extensions.md    # internal CM extension contracts (fold/lint/completion/highlight)
│   └── grammar-tokens.md       # new Lezer tokens/nodes + highlight tags
└── checklists/
    └── requirements.md  # (from /speckit-specify)
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── lib/codemirror/
│   │   ├── asciidoc.grammar                 # EXTEND: attr lines, links/URLs, passthrough/anchors/callouts,
│   │   │                                    #   breaks, conditionals, inline UI/math macros, CSV/DSV tables,
│   │   │                                    #   smart quotes/replacements/entities/hard breaks
│   │   ├── asciidoc-block-tokens.ts         # EXTEND: tokenizers for the above; raw heading level; [discrete]/[float]
│   │   ├── asciidoc-heading-levels.ts       # NEW: effective-level (leveloffset) styling + max cutoff + discrete (US3)
│   │   ├── asciidoc-highlight.ts            # EXTEND: tags for new constructs
│   │   ├── asciidoc-fold.ts                 # EXTEND: + LiteralBlock/AdmonitionBlock; NEW section/table/
│   │   │                                    #   conditional/comment-run/attr-run fold services
│   │   ├── asciidoc-source-highlight.ts     # NEW: parseMixed/decoration source-language injection (US5)
│   │   ├── asciidoc-completions.ts          # EXTEND: source-language completion; cross-file targets
│   │   ├── asciidoc-diagnostics.ts          # NEW: @codemirror/lint source (US8)
│   │   ├── asciidoc-symbol-index.ts         # NEW: client PROJECTION over shared asciidoc-model (US8/US12)
│   │   ├── asciidoc-fold-persist.ts         # NEW: fold-all/unfold-all/to-level + persistence (US10)
│   │   ├── asciidoc-metrics.ts              # NEW: word count / reading time (US11)
│   │   ├── asciidoc-spellcheck.ts           # NEW: nspell-based, tree-aware (US9)
│   │   ├── asciidoc-paste.ts                # NEW: paste-URL→link, paste-HTML→AsciiDoc, image paste/drop (US9)
│   │   └── html-to-asciidoc.ts              # NEW: Markdown-subset→AsciiDoc mapper (turndown does HTML→MD) (US9)
│   ├── components/editor/
│   │   ├── editor-toolbar.tsx               # FIX: pass softWrap/setSoftWrap (US2); declaration insert (US6)
│   │   ├── editor-settings-panel.tsx        # (soft-wrap toggle already present)
│   │   ├── editor-status-bar.tsx            # EXTEND: metrics (US11)
│   │   ├── editor-go-to-symbol.tsx          # NEW: project-wide symbol palette (US8)
│   │   └── editor-diagnostics-*.tsx         # NEW: diagnostics surfacing if needed
│   ├── hooks/
│   │   ├── use-editor-mount.ts              # WIRE: new extensions, keymaps (shortcuts/auto-pair/comment)
│   │   ├── use-editor-preferences.ts        # EXTEND: fold-state + spell-check ignore-list (per-user)
│   │   └── use-project-symbol-index.ts      # NEW: fetches file contents, builds/caches index, SSE invalidate
│   └── app/(dashboard)/.../project-editor-layout.tsx  # FIX: stable editor mount (US1)
├── e2e/                                     # NEW specs — one per story (see quickstart.md matrix)
└── tests/                                   # jest unit tests mirroring src/

apps/api/
├── src/routes/projects/                     # NEW: set-main-file route; file-content read for index (reuse if present)
└── tests/routes/

packages/domain/
├── src/entities/project.ts                  # EXTEND: mainFileNodeId
├── src/use-cases/project/set-project-main-file.ts   # NEW
├── src/use-cases/file-tree/{move,rename}-file.ts    # EXTEND: rewrite include/image/xref references (US12)
├── src/use-cases/content/find-references.ts         # NEW: find-usages / reference extraction (US12)
├── src/ports/project/                       # EXTEND: main-file read/write
└── tests/                                   # in-memory fakes + use-case tests

packages/shared/                             # cross-boundary contracts + pure rules (single source)
├── src/asciidoc-model/                      # NEW: Reference/ProjectSymbol/Diagnostic/IncludeEdge DTOs
│                                            #   + reference/symbol extraction + include-graph/leveloffset rules
├── src/project-path/                        # NEW: resolveSandboxedPath() (Constitution IX) — one rule
└── tests/                                   # pure unit tests for the above

packages/db/
└── prisma/schema.prisma                     # Project.mainFileNodeId (dev: prisma db push; no committed migration yet)
```

> **Shared-model rule (architecture):** the AsciiDoc structural shapes/rules and sandbox path resolution live **once** in `packages/shared`; `apps/web` (symbol index) and `packages/domain` (`FindReferencesUseCase`, move/rename) both import them. The web symbol index is a read-only projection, not a second parser. See `architecture-migration-plan.md`.

**Structure Decision**: Web modular monolith (existing). Editor features are predominantly **client-side** (`apps/web/src/lib/codemirror/*` + hooks/components). Server/domain work: the project main-file setting (entity + use case + port + API + Prisma migration) and the move/rename reference-rewriting + find-references use cases (US12). The preview Web Worker (`apps/web/src/workers/asciidoc-render.worker.ts`) **is** changed in Increment D for FR-068 (resolve `include::` for the assembled main document) — but strictly under Principle IX: a sandbox-confined include resolver (reject traversal/remote) feeding the **existing sanitizer unchanged**, with scroll-sync regression tests (Constitution VIII). The editor-side symbol index remains independent of this render path.

## Phase 0: Outline & Research

`research.md` resolves the technology/approach choices flagged above, each as Decision / Rationale / Alternatives:
1. In-editor source-language highlighting mechanism (parseMixed + curated CM language packs vs. highlight.js decoration layer) — Constitution IV.
2. HTML→AsciiDoc conversion — `turndown` (HTML→MD) + first-party MD-subset mapper (resolved in research R2) — Constitution IV.
3. Diagnostics engine (`@codemirror/lint`) and async, debounced lint-source design over the symbol index.
4. Cross-file include-graph + project symbol/reference index: client-side build, content source (persisted + live open file per FR-048), caching, SSE invalidation — **without** touching the preview render path (Constitution VIII).
5. Main-file setting persistence (Prisma field, domain use case, API, web UI) and permission scoping (Constitution VII callout).
6. Section/table/conditional/comment-run folding **without** a new grammar Section node (heading-driven fold service); copy-collapsed semantics.
7. Spell-check engine (`nspell` + dictionary) with syntax-tree-aware skipping of verbatim/macros (Constitution IV + VII per-user ignore list).
8. Keybinding strategy (bind bold/italic/monospace/comment; auto-pair; snippet tab-stops) avoiding conflicts with save/find/undo (FR-041).
9. Header max-level cutoff behavior (what AsciiDoc treats as beyond max; align with renderer).
10. **E2E strategy for CodeMirror** (the user's explicit requirement): how Playwright asserts highlighting (DOM token classes), folding (gutter + hidden ranges + clipboard), completion (listbox), diagnostics (lint markers), cross-file navigation (active-file switch), and **preview-toggle content retention** — on both collab and REST paths, against the isolated local stack.

## Phase 1: Design & Contracts

- **data-model.md**: `Project.mainFileNodeId`; per-user EditorPreference additions (fold state, spell-check ignore-list; line-wrap already exists); client-side entities Project Symbol, Document Tree / Include Graph, Reference, Diagnostic, Fold State; validation rules and lifecycle.
- **contracts/**: `api-main-file.md` (PUT main-file endpoint, Project DTO field, Zod/Fastify schema, `Result` errors; **per-route rate limit with env-bound config options + `429`** per the security constitution — FR-073); `editor-extensions.md` (internal contracts for the fold service, lint source, completion sources, source-highlight injection, metrics — inputs/outputs/triggers); `grammar-tokens.md` (new Lezer tokens/nodes + `@lezer/highlight` tag mapping, with the header max-level rule).
- **quickstart.md**: setup/run, the per-story manual validation steps, the **e2e coverage matrix** (one Playwright spec per story) and how to run it on the isolated stack, plus the gate commands from the quality-gates notes.
- **Agent context**: update the project agent context file (`AGENTS.md`/`CLAUDE.md`) to reference this plan.

## Complexity Tracking

> No constitution violations requiring justification. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |
