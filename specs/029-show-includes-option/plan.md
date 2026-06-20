# Implementation Plan: Optional Display of Included AsciiDoc Files in Preview

**Branch**: `029-show-includes-option` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-show-includes-option/spec.md`

## Summary

The HTML preview inlines `include::` directives via the include-assembler. This feature (a) adds a per-user **"show included files"** preference (default **disabled**) controlling that inlining, and (b) generalizes assembly so it applies to the preview of **every** AsciiDoc file with includes — rooted at the open file — not only the configured main file (FR-014), always reading the **most current** content of each file (live Hocuspocus/Yjs where a session is active, else latest saved — FR-015). The per-user preference controls inlining:

- **Disabled (default)**: the assembler suppresses each included file's rendered body and emits a subtle, clickable **placeholder** at the include location (click → open that file in the editor). It still emits the includes' **document-setting attribute entries** (`:name:` values, `:leveloffset:`, caption/label/numbering, `sectnums`, auto-ID, `xrefstyle`, …) — across the full transitive include graph — so variable/attribute resolution for content *after* the include is identical to today.
- **Enabled**: the assembler inlines included content exactly as it does now.

The preference is stored **browser-local (client-only, localStorage)** — like the editor's left-panel view preference; it is NOT synced to the account or across devices (no server/DB change). It is surfaced as a toggle in the **preview header only**, and applied live without a manual reload. Images and all non-included content are unaffected.

**Technical approach**: thread a `showIncludes` boolean from the preference → preview component → `useAsciidocPreview` render request → worker → `assembleIncludes`. The assembler gains a hide mode (attribute-only recursion + placeholder emission). The worker now assembles **rooted at the open file for every preview** (generalizing the current main-file-only gate), with its `readFile` overlaying the live open-file buffer onto the `getFiles()` snapshot so the root reflects the latest keystroke; feature-027 inherited-scope seeding (anchored to the main file) coexists. Non-open files' content comes from `getFiles()` → `getDocumentContent()`, which already returns live Hocuspocus text for files with an active session (FR-015). The placeholder is an HTML passthrough block carrying the sandbox-resolved, HTML-escaped target in a `data-*` attribute; it passes **unchanged** through the existing DOMPurify sanitizer (Constitution VIII) and the preview attaches a delegated click/keyboard handler routing to the existing `handleNavigateToFile(path)`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 18 / Next.js (app router), Node.js (Fastify API)

**Primary Dependencies**: `asciidoctor` (Opal, in Web Worker), `dompurify` (preview sanitization), existing `@asciidocollab/asciidoc-core` (conditional/attribute authority), existing `useEditorPreferences` localStorage plumbing. (No server/Prisma/API involvement.)

**Storage**: Browser-local storage only (client-only preference, like `leftPanelTab`). **No database, domain, repository, or API change** — the value is stripped from the account preferences PUT (added to `CLIENT_ONLY_KEYS`) and never read back from the server.

**Testing**: Jest per package — web component + hook + assembler unit tests (jsdom / pure TS). TDD red-green-refactor (Constitution II). No performance tests (not requested by spec; Constitution II opt-in). No server-side tests (no server change).

**Target Platform**: Modern browsers (preview render in a Web Worker); Linux server for API.

**Project Type**: Web application (monorepo: `apps/web`, `apps/api`, `packages/domain`, `packages/infrastructure`, `packages/db`, `packages/shared`, `packages/asciidoc-core`).

**Performance Goals**: Preview re-render stays within the existing debounce (`PREVIEW_DEBOUNCE_MS`); hide mode performs the same single include-graph walk as today (no extra parse). No new latency targets asserted.

**Constraints**: Sanitizer must remain unchanged and re-applied to the placeholder (Constitution VIII/IX); placeholder target is untrusted → sandbox-confined + HTML-escaped (Constitution IX); placeholder styling scoped to the preview content surface (Constitution VI); preference is per-user, never mutates shared content (Constitution VII). Assembling include-bearing non-main files widens the existing approximate-scroll-sync tradeoff to those files (include-free files keep exact sync); content currency for non-open files is bounded by the symbol index's session-aware fetch.

**Scale/Scope**: One client-only boolean preference (web only); one substantive behavior change localized to `assemble-includes.ts`; ~no change to the cross-document attribute model (feature 027) — it is reused verbatim. No server-side surface.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Code** — PASS. New `showIncludes`/`emit` flags are explicit and named; placeholder emission isolated in one helper; no magic strings (placeholder class/data-attr are named constants).
- **II. TDD (NON-NEGOTIABLE)** — PASS (plan mandates red-first). New behavior is covered by failing tests first: assembler hide-mode unit tests (attribute fidelity, placeholder emission, nested/transitive, conditional gating, leveloffset/captions, show-mode regression), the web preference hook (default false, localStorage, client-only/not-PUT), the preview hook (generalized root, content overlay), and the control + click-handler component tests. No performance/load tests (spec does not request them).
- **III. Seam Testing with In-Memory Fakes** — PASS (n/a for new server seams — there are none). The assembler is tested via its `readFile` callback (pure function, no IO); hooks/components via jsdom.
- **IV. Reuse Before Rebuild** — PASS. Reuses the existing assembler, the feature-027 attribute model (`applyLineAttributes`/`documentOrderEvents`/conditional authority), the existing `useEditorPreferences` + `CLIENT_ONLY_KEYS` pattern (mirrors `leftPanelTab`), `handleNavigateToFile`, and the `PreviewStyleControl` pattern. No new vendored asset; no re-derivation.
- **V. Theming via Design Tokens** — PASS. The toggle control (app chrome) uses design tokens like the existing header controls.
- **VI. Style Isolation** — PASS. Placeholder styling is scoped under `.asciidoc-preview-content` (preview surface) and must not touch app chrome; covered by the existing scoping approach.
- **VII. Per-User Preferences, Shared Content Immutability** — PASS. `showIncludedFiles` is a client-only, browser-local preference (localStorage), inherently per-user/per-browser, never stored on the project/document; toggling changes only this browser's own preview and never rewrites document source (FR-013 / SC: one user's choice doesn't affect others).
- **VIII. Editor Pipeline Integrity** — PASS, with explicit call-out. The feature *changes assembled content* (suppresses bodies, injects a placeholder) but the assembled output passes **unchanged through the existing DOMPurify sanitizer** in `use-asciidoc-preview.ts` — no new/relaxed/forked sanitization path. Scroll-sync: generalizing assembly to all files means an include-bearing non-main file now has approximate scroll-sync after its first include — the SAME tradeoff already accepted for the main-file preview, and explicitly an inherent limit of assembled multi-file previews; an include-FREE file assembles to itself so its scroll-sync stays EXACT. A no-regression test covers the include-free case and the placeholder block still receiving `data-source-line`.
- **IX. Untrusted Input Boundary (NON-NEGOTIABLE)** — PASS, with explicit call-out. The placeholder embeds a *user-controlled* include target. It is resolved through the existing `resolveSandboxedPath` boundary (same as today) and **HTML-escaped** before being placed in the passthrough's `data-*`/text; the click handler navigates only to a path resolvable within the project file snapshot. No remote fetch, no traversal, no new sanitizer bypass. Recorded here per the no-silent-bypass rule.

**Result**: No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/029-show-includes-option/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── render-worker-interface.md    # RenderRequest + assembleIncludes options delta
│   └── include-placeholder-dom.md    # Placeholder DOM/CSS + click contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
# NO server-side changes — preference is browser-local (client-only).
# Untouched: packages/db, packages/shared, packages/domain, packages/infrastructure, apps/api.

apps/web/src/
├── workers/
│   ├── assemble-includes.ts              # CORE: showIncludes option + hide mode (attr-only recursion + placeholder)
│   └── asciidoc-render.worker.ts         # thread showIncludes from RenderRequest → assembleIncludes
├── hooks/
│   ├── use-asciidoc-preview.ts           # +showIncludes in RenderRequest; assemble rooted at open file (any file); re-render on toggle
│   └── use-editor-preferences.ts         # +showIncludedFiles (default false, localStorage, CLIENT_ONLY_KEYS — not PUT/synced)
├── components/
│   ├── asciidoc-preview.tsx              # +showIncludedFiles + onOpenInclude props; header toggle; delegated click
│   └── show-includes-control.tsx         # NEW: header toggle (PreviewStyleControl-style)
├── lib/asciidoc/
│   └── include-placeholder.ts            # NEW: shared placeholder builder + class/data-attr constants + escapeHtml (used by assembler + preview + CSS)
├── styles/
│   └── asciidoc-preview.css              # .adoc-include-placeholder styling (scoped to preview surface)
└── app/(dashboard)/dashboard/projects/[id]/
    └── project-editor-layout.tsx         # read showIncludedFiles; pass open-file assembly root for ANY file; onOpenInclude=handleNavigateToFile
```

**Structure Decision**: Existing monorepo web-application layout. The behavioral core is one file (`assemble-includes.ts`); everything else is a thin, pattern-matching vertical slice (preference persistence + UI wiring) mirroring the feature-022 preview-style preference and feature-027 assembler/scope plumbing.

## Complexity Tracking

> No Constitution violations — no entries required.
