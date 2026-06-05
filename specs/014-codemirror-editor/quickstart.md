# Developer Quickstart: AsciiDoc Code Editor

**Branch**: `014-codemirror-editor` | **Date**: 2026-06-04

---

## What This Feature Adds

Replaces the read-only `FileContentPanel` component with a full CodeMirror 6 editor backed by a hand-authored AsciiDoc Lezer grammar. Adds auto-save, find/replace, section outline, auto-completion, a formatting toolbar, status bar, minimap, and user editor preferences.

---

## New Packages to Install (apps/web)

```bash
# CodeMirror 6 core
pnpm --filter @asciidocollab/web add @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @codemirror/search @codemirror/autocomplete @codemirror/fold

# Lezer (grammar runtime)
pnpm --filter @asciidocollab/web add @lezer/common @lezer/lr @lezer/highlight

# Lezer grammar compiler (dev, build-time only)
pnpm --filter @asciidocollab/web add -D @lezer/generator

# Minimap
pnpm --filter @asciidocollab/web add @uiw/codemirror-extensions-minimap
```

---

## New Environment Variable (apps/web)

```bash
# .env.local (development)
NEXT_PUBLIC_EDITOR_AUTOSAVE_DEBOUNCE_MS=4000
```

Add to `.env.example` and deployment configuration. In E2E tests, set to `0` to disable debouncing.

---

## Grammar Build Step

The Lezer grammar is defined in `apps/web/src/lib/codemirror/asciidoc.grammar`. It must be compiled before the Next.js build:

```bash
# One-shot compile
pnpm --filter @asciidocollab/web exec lezer-generator src/lib/codemirror/asciidoc.grammar --output src/lib/codemirror/asciidoc-parser.js

# Watch mode (development)
pnpm --filter @asciidocollab/web exec lezer-generator --watch src/lib/codemirror/asciidoc.grammar --output src/lib/codemirror/asciidoc-parser.js
```

Add the compile step to the `prebuild` script in `apps/web/package.json`.

The compiled `asciidoc-parser.js` is committed to the repository (it is a build artefact that belongs in source control for this project, matching the pattern used by published `@codemirror/lang-*` packages).

---

## Key Source Locations

| Area | Path |
|------|------|
| Grammar source | `apps/web/src/lib/codemirror/asciidoc.grammar` |
| Compiled parser | `apps/web/src/lib/codemirror/asciidoc-parser.js` |
| Language extension | `apps/web/src/lib/codemirror/asciidoc-language.ts` |
| Highlight style | `apps/web/src/lib/codemirror/asciidoc-highlight.ts` |
| Completion sources | `apps/web/src/lib/codemirror/asciidoc-completions.ts` |
| Section outline extractor | `apps/web/src/lib/codemirror/asciidoc-outline.ts` |
| Main editor component | `apps/web/src/components/editor/asciidoc-editor.tsx` |
| Toolbar | `apps/web/src/components/editor/editor-toolbar.tsx` |
| Status bar | `apps/web/src/components/editor/editor-status-bar.tsx` |
| Section outline panel | `apps/web/src/components/editor/editor-section-outline.tsx` |
| Settings panel | `apps/web/src/components/editor/editor-settings-panel.tsx` |
| Auto-save hook | `apps/web/src/hooks/use-auto-save.ts` |
| Editor preferences hook | `apps/web/src/hooks/use-editor-preferences.ts` |
| Section outline hook | `apps/web/src/hooks/use-section-outline.ts` |

---

## Key Integration Point

The editor replaces `FileContentPanel` in `project-editor-layout.tsx`. The layout already passes `selectedFile` and `contentState`. The editor component will additionally need `projectId` (for auto-save) and `isOwner` (for read-only mode).

```tsx
// Before (phase 5)
<FileContentPanel selectedFile={selectedFile} contentState={contentState} />

// After (phase 6)
<AsciiDocEditor
  selectedFile={selectedFile}
  contentState={contentState}
  projectId={projectId}
  canEdit={isOwner || isMember}
/>
```

---

## Running Quality Gates

```bash
# From repo root
pnpm --filter @asciidocollab/web lint
pnpm --filter @asciidocollab/web typecheck
pnpm --filter @asciidocollab/web test
pnpm --filter @asciidocollab/domain test
pnpm --filter @asciidocollab/infrastructure test
```

---

## Test File Locations

| Test type | Path convention |
|-----------|-----------------|
| Domain use cases | `packages/domain/tests/use-cases/settings/` |
| Domain port fakes | `packages/domain/tests/ports/user/` |
| Infrastructure repos | `packages/infrastructure/tests/persistence/user/` |
| React components | `apps/web/tests/components/editor/` |
| Hooks | `apps/web/tests/hooks/` |
| Grammar parser | `apps/web/tests/lib/codemirror/` |
| E2E | `apps/web/tests/e2e/editor/` |

---

## TDD Cycle Notes

- Grammar tests: use `@lezer/lr`'s `Tree` API to assert token types at specific positions in sample AsciiDoc strings. These are pure unit tests with no DOM.
- Auto-save hook tests: stub `fetch` at the test boundary; do NOT mock the `useAutoSave` hook itself.
- Editor preferences use cases: use the in-memory fake (`InMemoryEditorPreferencesRepository`) — no Prisma, no network.
- Infrastructure tests: use testcontainers (PostgreSQL) following existing patterns in `packages/infrastructure/tests/`.
