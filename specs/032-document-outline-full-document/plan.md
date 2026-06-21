# Implementation Plan: Full-Document Outline Across Includes

**Branch**: `032-document-outline-full-document` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/032-document-outline-full-document/spec.md`

## Summary

Extend the existing single-file outline panel so that, when a project has a configured main document, it shows the **complete heading hierarchy of the whole document assembled across `include::` directives**, regardless of which file is open — with a per-user option to narrow it to the current file, and a fallback to current-file-only when no main document is configured or the open file is unreachable. The assembled outline must reflect **live collaborative (Hocuspocus/Yjs) content** for included files in active sessions (≤2 s freshness) and render **section/cursor-level collaborator presence** on headings, mirroring the file-tree's open-file presence.

**Technical approach (reuse-first, per the user directive "reuse or refactor existing sources for the file tree"):**
- **Outline assembly** — refactor `assembleIncludes()` to additionally emit a **source map** (assembled-line → `{ fileId, sourceLine }`); run the existing `extractHeadings()`/`computeHeadingLevels()` over the assembled text unchanged, then attach provenance from the source map. One include-resolution authority shared with the preview (no fork).
- **Content source** — reuse `useProjectSymbolIndex` content fetching, which already reads **live doc state** (`getDocumentContent`) with the open file overlaid; add live-change observation of reachable included docs to meet the 2 s freshness target.
- **Presence** — refactor the existing project presence room (`useProjectPresence`) to also publish the local user's **current section line**, and aggregate remote peers' `{ openFileNodeId, cursorLine }` into per-heading presence. Reuse `OpenByOthersMarker` + `ParticipantAvatar` to render it on outline entries.
- **Scope option** — add one **client-only** preference (`outlineScope`) to `useEditorPreferences`, exactly like `leftPanelTab`/`showIncludedFiles`.
- **Navigation** — reuse `revealLine` (same file) and `handleNavigateToFile` + `pendingXrefLine` (cross file).

## Technical Context

**Language/Version**: TypeScript (ES2022), React 19 / Next.js (App Router), Node for the collaboration server.

**Primary Dependencies**: CodeMirror 6 (editor + outline state), Yjs + `y-codemirror.next` + Hocuspocus (real-time collaboration & awareness), existing in-repo modules: `assemble-includes`, `use-project-symbol-index`, `asciidoc-outline`/`asciidoc-effective-levels`, `use-project-presence`, `OpenByOthersMarker`/`ParticipantAvatar`, `use-editor-preferences`, `@asciidocollab/asciidoc-core`.

**Storage**: No new persistent storage. Outline scope is a **client-only localStorage** preference (per-user, this device). Main-document setting already exists (project-scoped). Included-file content comes from the live collaborative document endpoint already used by the symbol index.

**Testing**: Jest + `@testing-library/react` (unit/component/hook), Playwright (e2e, multi-user). Follows red-green-refactor.

**Target Platform**: Web (modern browsers); `apps/web` frontend + collaboration (Hocuspocus) server in the pnpm monorepo.

**Project Type**: Web application (monorepo: `apps/web`, collab server, `packages/*`).

**Performance Goals** *(success criteria; see Constitution Check re: opt-in perf tests)*: scope switch < 1 s; collaborator heading edit reflected in another author's outline < 2 s; presence indicator move/clear within a few seconds; smooth at the supported scale.

**Constraints**: Supported scale ~50 included files / ~500 headings. Must NOT regress preview sanitization or scroll-sync (Principle VIII). Include resolution stays sandbox-confined (Principle IX). Awareness is **per-document** — there is no global cross-file cursor channel, so cursor-level presence is carried over the existing **project presence room** rather than by subscribing to every file's editor awareness.

**Scale/Scope**: Up to ~50 reachable files, ~500 headings; presence for the project's concurrent collaborators.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Clean Code** | PASS. New logic is small, named, single-purpose (an outline assembler producing provenance-tagged entries; a presence aggregator). Errors (unresolved includes) handled on explicit paths. |
| **II. TDD (NON-NEGOTIABLE)** | PASS. Each unit (source-map assembly, provenance attribution, presence aggregation, scope selection, cursor→heading mapping) is driven by a failing test first. **Performance/load tests are OPT-IN and the spec does not explicitly request them**, so the latency SCs (SC-003/007/009/011) are validated by functional + e2e behavior, not benchmark tests — their absence is not a coverage gap (Constitution II). |
| **III. Seam Testing / In-Memory Fakes** | PASS. No new domain repository interface. Content access and awareness are injected behind callback/provider seams (`readFile`, `createProvider`, awareness `getStates`) already faked in existing tests; new code reuses those seams with in-memory fakes — no mocking-library simulation of repositories. |
| **IV. Reuse Before Rebuild** | PASS — central. Reuses presence room, avatar/marker components, include assembler, symbol index, effective-levels/heading extraction, preference hook, navigation. **Extends** first-party assets (`assembleIncludes`, `useProjectPresence`, `useEditorPreferences`) rather than re-deriving; no maintained vendorable equivalent exists for AsciiDoc include assembly or this app's presence — documented in research.md. |
| **V. Theming via Design Tokens** | PASS. Presence markers reuse `ParticipantAvatar` (token-driven, light/dark correct); the open-file/current-section marks use existing outline token styles. No color literals. |
| **VI. Style Isolation** | PASS. Outline is app chrome; no document-rendering stylesheet involved. No preview style change. |
| **VII. Per-User Preferences vs Shared Content** | PASS. `outlineScope` is a per-user, client-only preference (never PUT to account, never mutates shared docs). The main-document setting is pre-existing **project-scoped** config, not a user preference. One user's scope/presence view never alters another's document. |
| **VIII. Editor Pipeline Integrity** | ATTENTION (justified, no regression). The `assembleIncludes` change is **additive** (an optional source map); the existing assembled-content output consumed by the preview is byte-for-byte unchanged, proven by a regression test. The outline extracts heading **text** only (no HTML rendered) and does not touch the preview sanitizer or scroll-sync seam. |
| **IX. Untrusted Input Boundary (NON-NEGOTIABLE)** | PASS. Include resolution reuses the existing sandbox-confined resolver (no traversal/SSRF). Heading titles are rendered as React text (auto-escaped) — no new HTML sink. **Peer awareness data (`cursorLine`) is untrusted** → validated/clamped to document bounds before mapping to a heading. No sanitizer fork. |

**Result**: PASS. No unjustified violations; Principle VIII attention item is additive and covered by a no-regression test.

## Project Structure

### Documentation (this feature)

```text
specs/032-document-outline-full-document/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (module + awareness contracts)
│   ├── outline-assembly.md
│   ├── presence-awareness.md
│   └── outline-ui.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
apps/web/src/
├── lib/
│   ├── codemirror/
│   │   ├── asciidoc-outline.ts            # extractHeadings / SectionOutlineEntry — extend with provenance
│   │   └── asciidoc-effective-levels.ts   # computeHeadingLevels — reused unchanged
│   └── outline/
│       ├── assemble-outline.ts            # NEW: assembled, provenance-tagged outline from include tree
│       └── outline-presence.ts            # NEW: map peer {fileId,cursorLine} → heading presence
├── workers/
│   └── assemble-includes.ts               # REFACTOR: optional source map (assembled line → {fileId, line})
├── hooks/
│   ├── use-section-outline.ts             # REFACTOR: full-document vs current-file scope
│   ├── use-project-symbol-index.ts        # REUSE: content map (live + fallback); add reachable-doc change signal
│   ├── use-project-presence.ts            # REFACTOR: publish + aggregate current section line
│   └── use-editor-preferences.ts          # REFACTOR: add client-only `outlineScope`
├── components/
│   ├── editor/
│   │   ├── outline-view.tsx               # REFACTOR: scope toggle, presence wiring, fallbacks
│   │   └── editor-section-outline.tsx     # REFACTOR: render presence marker + open-file/current marks
│   └── file-tree/
│       └── open-by-others-marker.tsx      # REUSE: presence avatar cluster (+ ParticipantAvatar)
└── ...

apps/web/tests/        # Jest unit/component/hook tests (mirror of src)
apps/web/e2e/          # Playwright multi-user specs
```

**Structure Decision**: Web monorepo. The bulk of the work is in `apps/web` (frontend) reusing/refactoring existing modules. A new `lib/outline/` groups the two genuinely new pure modules (assembler + presence mapping) so they are unit-testable in isolation. The only cross-cutting refactor is `assemble-includes.ts` (additive source map) and `use-project-presence.ts` (additive cursor field) — both extensions of existing file-tree-related sources, per the user directive.

## Complexity Tracking

> No constitution violations require justification. The Principle VIII attention item is an additive, test-guarded change, not a deviation.

| Item | Decision | Note |
|------|----------|------|
| Cross-file cursor presence transport | Carry the current-section line over the existing **project presence room**, not per-file editor awareness | Awareness is per-document; subscribing to every file's editor awareness is heavier and unavailable for non-open files. Reuses the file-tree presence source (directive-aligned). |
| Near-real-time content of non-open includes | Observe live changes of reachable docs + debounced recompute | Bounded by the ~50-file scale cap; see research.md for the chosen mechanism and alternative. |
