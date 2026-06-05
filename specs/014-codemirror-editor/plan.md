# Implementation Plan: AsciiDoc Code Editor

**Branch**: `014-codemirror-editor` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-codemirror-editor/spec.md`

---

## Summary

Replace the read-only `FileContentPanel` with a full CodeMirror 6 editor backed by a hand-authored AsciiDoc Lezer grammar. The editor adds syntax highlighting for all AsciiDoc constructs listed in FR-ED-002 (headings, inline formatting, all block types, tables, STEM, comments, footnotes, admonitions, description lists, checklists), auto-save with a 4-second debounce, find/replace with regex, a section outline, auto-completion for attributes/include paths/cross-references, a formatting toolbar, status bar, minimap, and user editor preferences stored in the database.

This is a frontend-heavy feature. The domain layer gains one new entity (`EditorPreferences`), two use cases, and a new repository port. All other domain and infrastructure code is reused.

---

## Technical Context

**Language/Version**: TypeScript 5.x (all layers)

**Primary New Dependencies**:
- `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/search`, `@codemirror/autocomplete` — CodeMirror 6 core (mandated by Architecture Constitution; fold/gutter APIs are part of `@codemirror/language`, no separate `@codemirror/fold` package exists in CM6 6.x)
- `@lezer/common`, `@lezer/lr`, `@lezer/highlight` — Lezer runtime
- `@lezer/generator` (dev) — grammar compiler
- `@uiw/codemirror-extensions-minimap` — CM6 minimap extension

**Primary Existing Dependencies (reused)**:
- Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui + Radix UI
- Fastify (API), Prisma + PostgreSQL (data), Jest + Testing Library + Playwright (tests)

**Storage**: PostgreSQL via Prisma — new `editor_preferences` table (schema update only; migration on user request per Architecture Constitution policy)

**Testing**:
- Domain: Jest + in-memory fakes
- Infrastructure: Jest + testcontainers (PostgreSQL)
- Frontend components: Jest + Testing Library + jsdom
- Grammar: Jest + `@lezer/lr` `Tree` API
- E2E: Playwright

**Target Platform**: Desktop browsers (Chrome, Firefox, Safari); mobile explicitly out of scope (spec A-008)

**Performance Goals**:
- < 16 ms keystroke latency on documents up to 5 000 lines (SC-002)
- < 500 ms initial syntax highlighting on 500-line file (SC-001)
- < 200 ms section outline update after heading edit (SC-005)
- < 300 ms auto-completion suggestion appearance (SC-008)

**Constraints**:
- No Vim/Emacs keybindings (spec A-004)
- Desktop-only (spec A-008)
- No real-time collaboration in this phase (spec A-002)
- No inline include resolution (spec A-006)
- STEM inline rendering deferred to preview panel (spec A-010)

**Scale/Scope**: Single Next.js `'use client'` component tree; single Fastify route pair; one new Prisma model

---

## Constitution Check

*Gates evaluated against Governance Constitution v2.0.0 and Architecture Constitution v2.4.0.*

### I. Clean Code ✅

- All new functions (hooks, grammar helpers, toolbar actions) are small and single-purpose.
- Named constants for magic values: `AUTOSAVE_DEBOUNCE_MS`, `EXTERNAL_CHANGE_POLL_INTERVAL_MS` (30 000), `FONT_SIZE_MIN` (8), `FONT_SIZE_MAX` (32).
- Domain errors typed: `ValidationError` for invalid font size / theme; no string-based errors in use cases.

### II. TDD (NON-NEGOTIABLE) ✅

Every task in this plan follows Red → Green → Refactor:
1. Grammar tests written first: assert specific token types in sample AsciiDoc strings before implementing the grammar rule.
2. Use case tests with in-memory fakes before writing `GetEditorPreferencesUseCase` / `SaveEditorPreferencesUseCase`.
3. Component tests with Testing Library before building `AsciiDocEditor`, `EditorToolbar`, `EditorStatusBar`.
4. Hook tests with stubbed `fetch` before implementing `useAutoSave`, `useEditorPreferences`.
5. No production code committed before a failing test exists for it.

### III. Seam Testing with In-Memory Fakes ✅

- `InMemoryEditorPreferencesRepository` mirrors the Prisma implementation's constraints (unique userId, upsert semantics). Lives at `packages/domain/tests/ports/user/in-memory-editor-preferences.repository.ts`.
- No `jest.mock` for the repository layer.

### Architecture Constitution ✅

- Domain layer imports: `EditorPreferences` entity has zero external dependencies (only domain-internal value objects and types).
- Business logic (font-size validation, theme validation) in use cases, not in the Fastify route handler.
- `EditorPreferencesRepository` interface in `packages/domain/src/ports/user/`.
- `EditorPreferencesDto` / `UpdateEditorPreferencesDto` defined in `packages/shared` — single source of truth.
- No `any` types in production code; no `as` casts.
- Test files in `tests/` directories only — no `__tests__/`.
- Prisma migration script NOT created until user explicitly requests it (Architecture Constitution — Database Migration Policy).

### Security Constitution ✅

- Editor preferences endpoints require authentication (existing `requireAuth` plugin).
- Include-path completion scoped to current project only — the file-tree GET endpoint already enforces project membership (FR-LF-005).
- `contentId` in ETag header does not expose internal file paths or database IDs.
- Font size and theme validated at the Fastify schema level before reaching the domain.

### Phased Delivery ✅

This plan is divided into six milestones, each independently deployable and testable. Milestone 1 (syntax highlighting) is a pure addition; it does not break any existing functionality. Subsequent milestones layer on top without removing prior capabilities.

---

## Project Structure

### Documentation (this feature)

```text
specs/014-codemirror-editor/
├── spec.md
├── plan.md              ← this file
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── editor-api.md
└── tasks.md             (generated by /speckit-tasks)
```

### Source Code — New Files

```text
apps/web/src/
├── lib/
│   └── codemirror/
│       ├── asciidoc.grammar              ← Lezer grammar DSL source
│       ├── asciidoc-parser.js            ← compiled parser (committed artefact)
│       ├── asciidoc-language.ts          ← CM6 Language object
│       ├── asciidoc-highlight.ts         ← token → highlight style mapping
│       ├── asciidoc-completions.ts       ← attribute / include path / xref completion
│       ├── asciidoc-fold.ts              ← fold service for delimited blocks
│       └── asciidoc-outline.ts           ← section heading extractor
├── components/
│   └── editor/
│       ├── asciidoc-editor.tsx           ← main editor component (replaces FileContentPanel)
│       ├── editor-toolbar.tsx            ← formatting toolbar (4 groups)
│       ├── editor-toolbar-button.tsx     ← icon button with tooltip
│       ├── editor-status-bar.tsx         ← line / col / total lines
│       ├── editor-section-outline.tsx    ← section navigation panel
│       └── editor-settings-panel.tsx     ← font size + theme settings
└── hooks/
    ├── use-auto-save.ts                  ← debounced PUT with state tracking
    ├── use-editor-preferences.ts         ← load/persist font size + theme
    ├── use-section-outline.ts            ← derive outline from CM6 parse tree
    └── use-include-completions.ts        ← fetch + cache project file list

packages/domain/src/
├── entities/
│   └── editor-preferences.ts            ← new entity
├── value-objects/
│   ├── editor-preferences-id.ts         ← new value object
│   └── editor-theme.ts                  ← 'default' | 'high-contrast' + parse()
├── ports/user/
│   └── editor-preferences.repository.ts ← new port interface
└── use-cases/settings/
    ├── get-editor-preferences.ts         ← new use case
    └── save-editor-preferences.ts        ← new use case

packages/domain/tests/ports/user/
└── in-memory-editor-preferences.repository.ts

packages/infrastructure/src/persistence/user/
└── prisma-editor-preferences.repository.ts

packages/shared/src/dtos/
└── editor-preferences.dto.ts            ← EditorPreferencesDto, UpdateEditorPreferencesDto

packages/db/prisma/
└── schema.prisma                         ← add EditorPreferences model

apps/api/src/routes/
└── editor-preferences.ts                 ← GET + PUT /auth/me/editor-preferences
```

### Source Code — Modified Files

```text
apps/web/src/
├── app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx
│   └── Replace <FileContentPanel> with <AsciiDocEditor>
└── package.json
    └── Add CodeMirror + Lezer dependencies; add grammar prebuild script

apps/api/src/
├── routes/projects/file-content.ts
│   └── Add ETag response header to GET route
└── index.ts (or route registration file)
    └── Register editor-preferences routes

packages/db/prisma/schema.prisma
└── Add EditorPreferences model

packages/infrastructure/src/index.ts
└── Export PrismaEditorPreferencesRepository

packages/domain/src/
├── entities/index.ts     ← export EditorPreferences
├── ports/index.ts        ← export EditorPreferencesRepository
├── value-objects/index.ts← export EditorPreferencesId, EditorTheme
└── use-cases/index.ts    ← export Get/SaveEditorPreferencesUseCase
```

**Structure Decision**: Single delivery layer (`apps/web`) for all editor UI. Domain additions follow the existing entity/port/use-case pattern. No new packages or workspaces needed — the feature fits within the existing monorepo structure.

---

## Implementation Milestones

### Milestone 1 — Grammar & Syntax Highlighting (P1)

*Goal*: A user can open a `.adoc` file and see AsciiDoc syntax highlighted. The editor replaces the read-only panel. Viewer role gets a read-only highlighted view.

**Scope**:
1. Install CodeMirror 6 and Lezer packages in `apps/web`.
2. Add grammar prebuild step to `apps/web/package.json`.
3. Author `asciidoc.grammar` covering all FR-ED-002 token types:
   - Block level: document title, section headings (1–5), delimited blocks (listing, example, sidebar, quote, passthrough, open), STEM blocks, comment blocks, admonition blocks, table (`|===`)
   - List level: ordered, unordered, checklist, description list (standard, horizontal, Q&A)
   - Inline level: bold (`**`/`*`), italic (`__`/`_`), monospace (`` ` ``), highlight (`#`), subscript (`~`), superscript (`^`), attribute references (`{...}`), attribute entries (`:...:`)
   - Macro level: block/inline macros (image, video, audio, link, etc.), cross-references (`<<>>`), footnotes (`footnote:[]`)
   - Comment lines (`//`)
4. Implement `asciidoc-highlight.ts` mapping each token type to a highlight class.
5. Implement `asciidoc-language.ts` wrapping the compiled parser as a CM6 `Language`.
6. Build `AsciiDocEditor` component:
   - Accepts `content`, `canEdit`, `onChange` props
   - Configures `EditorView` with the AsciiDoc language, highlight style, standard keymap
   - Includes `history()` extension and `historyKeymap` (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) — undo/redo is part of baseline CM6 setup, requires no additional packages
   - Read-only mode when `canEdit` is false (uses `EditorState.readOnly`)
7. Replace `<FileContentPanel>` with `<AsciiDocEditor>` in `project-editor-layout.tsx`.
8. Tests:
   - Grammar unit tests: assert correct token types for representative AsciiDoc snippets covering all FR-ED-002 constructs.
   - Component test: editor renders content; viewer sees read-only editor.

**Milestone 1 passes when**: A `.adoc` file loads with syntax highlighting; a viewer cannot type; the existing `FileContentPanel` is removed.

---

### Milestone 2 — Auto-Save & Save State Indicator (P1)

*Goal*: Changes are persisted automatically; the editor always shows save state.

*Note*: `asciidoc-fold.ts` is implemented in Milestone 1 (grammar tier). This milestone wires folding into the editor and focuses on save behaviour.

**Scope**:
1. Implement `use-auto-save.ts`:
   - Accepts `content: string`, `projectId`, `fileNodeId`, `onDraftRecovered?` callback
   - Debounces PUT to `SaveDocumentContentUseCase` endpoint by `AUTOSAVE_DEBOUNCE_MS`
   - Exposes `saveState: EditorSaveState` (`saved | saving | unsaved | error`)
   - On error: sets state to `error`, retries once after 5 s
   - Registers `beforeunload` listener when `saveState !== 'saved'`; dispatches a `keepalive: true` fetch on `beforeunload` with the current unsaved content (FR-AS-006)
   - Listens to `window` `offline` / `online` events; when offline, writes pending content to `localStorage` under `OFFLINE_QUEUE_KEY_PREFIX + fileNodeId`; when `online` fires, flushes the queued content via PUT (FR-AS-007)
   - On mount: checks `localStorage` for an existing draft for this `fileNodeId`; if found, calls `onDraftRecovered(draft)` (FR-AS-007 recovery)
2. Add ETag header to `GET /projects/:projectId/files/:fileNodeId/content` response.
3. Implement external change polling in `use-auto-save.ts`:
   - Every 30 s, HEAD-request the content endpoint with `If-None-Match`
   - On 200 (changed): fire an `onExternalChange` callback → layout shows a toast notification; user retains their in-progress edits
4. Wire `use-auto-save` into `AsciiDocEditor`; display `EditorSaveState` via a status indicator in the editor chrome (a simple label above or below the editor, replaced by the full status bar in Milestone 4); show a recovery prompt when `onDraftRecovered` fires with a stored offline draft.
5. Add `OFFLINE_QUEUE_KEY_PREFIX = 'asciidocollab:editor-draft:'` to `constants.ts`.
6. Tests:
   - `use-auto-save` unit tests with stubbed `fetch` and `localStorage`: verify debounce, retry, `beforeunload` keepalive dispatch, offline queueing, online flush, draft recovery callback, external-change callback.

**Milestone 2 passes when**: Changes are auto-saved after 4 s of inactivity; save state transitions are correct; refreshing the page restores the saved content; a toast appears when another session saves the file; going offline queues saves to localStorage and flushes on reconnect; closing the tab with unsaved changes attempts a keepalive save.

---

### Milestone 3 — Find & Replace (P2)

*Goal*: Users can search and replace text including regex patterns.

**Scope**:
1. Add `@codemirror/search` extension to the editor configuration.
2. Configure `findAndReplace`, `searchKeymap`, regex toggle.
3. Ensure the find panel is keyboard-accessible (focus trap, Escape to dismiss).
4. Tests:
   - Component tests with Testing Library: open find panel, enter a term, verify match count displayed, press next/previous, replace single match.
   - Regex toggle test: valid regex highlights matches; invalid regex shows error indicator without crash.

**Milestone 3 passes when**: The find/replace panel opens via keyboard shortcut, shows match count, supports regex, and replaces correctly.

---

### Milestone 4 — Editor Chrome: Toolbar, Status Bar, Minimap (P2)

*Goal*: Full editor chrome is in place (toolbar, status bar, minimap, settings panel, editor preferences stored server-side).

**Scope — EditorPreferences domain stack**:
1. Add `EditorPreferencesId` value object.
2. Add `EditorTheme` value object with `parse()` factory.
3. Add `EditorPreferences` entity.
4. Add `EditorPreferencesRepository` port interface.
5. Add `InMemoryEditorPreferencesRepository` fake (test tree).
6. Implement `GetEditorPreferencesUseCase` and `SaveEditorPreferencesUseCase`.
7. Update `packages/db/prisma/schema.prisma` with `EditorPreferences` model.
8. Implement `PrismaEditorPreferencesRepository`.
9. Implement `GET`/`PUT /auth/me/editor-preferences` routes in `apps/api`.
10. Wire repos at composition root (`apps/api/src/index.ts`).

**Scope — Frontend**:
11. Implement `use-editor-preferences.ts`:
    - On mount: load from localStorage (instant); fetch from API (authoritative); merge and store both.
    - On change: write to localStorage immediately; debounce PUT to API (500 ms).
12. Implement `EditorToolbar`:
    - Four groups: Text Formatting, Structure, Blocks, Inline/References (full list per FR-EC-001).
    - Each button: icon + tooltip (name + shortcut). Overflow collapses into "More…" dropdown via `ResizeObserver`.
    - Toolbar buttons call CM6 commands that wrap selected text or insert snippets.
13. Implement `EditorStatusBar`:
    - Shows cursor line, column, total line count.
    - Reads from CM6 `EditorView.state`.
14. Implement `EditorSettingsPanel`:
    - Font size slider/stepper (range 8–32).
    - Theme selector (two options: default, high-contrast).
    - Calls `use-editor-preferences` on change.
15. Add `@uiw/codemirror-extensions-minimap` to the editor configuration.
16. Apply `EditorPreferences` (font size, theme CSS class) to the editor on load and on change.
17. Assemble all chrome in `AsciiDocEditor`.

**Tests**:
- Domain use case tests with in-memory fake.
- Infrastructure repo tests with testcontainers.
- API route tests.
- `use-editor-preferences` hook tests (stubbed fetch).
- `EditorToolbar` component tests: clicking bold wraps selected text; "More…" appears at narrow widths.
- `EditorSettingsPanel` tests: slider triggers preferences update.
- Minimap: smoke test that it renders without throwing.

**Milestone 4 passes when**: The toolbar inserts/wraps all listed constructs; the status bar shows correct line/column; the minimap is visible and scrolls the editor; editor preferences persist across page reloads.

---

### Milestone 5 — Language Features: Outline & Auto-Completion (P3)

*Goal*: Authors can navigate documents via section outline and receive auto-completion for attributes, include paths, and cross-references.

**Scope**:
1. Implement `asciidoc-outline.ts`:
   - Walks the CM6 parse tree to extract `SectionOutlineEntry[]` nodes.
   - Exported as a CM6 `StateField` that updates on every transaction.
2. Implement `use-section-outline.ts`:
   - Subscribes to the CM6 editor view to read the `SectionOutlineEntry[]` state field.
   - Returns the current outline array, live-updated.
3. Implement `EditorSectionOutline` component:
   - Renders the outline as a hierarchically indented list.
   - Clicking an entry calls `EditorView.dispatch` to move the cursor and scroll the editor.
   - Shows empty-state message when no headings exist.
4. Implement `asciidoc-completions.ts`:
   - Three completion sources registered with `@codemirror/autocomplete`:
     a. **Attribute completion**: triggers on `{`; matches against document-defined attributes (parsed from `:attr: value` entries in the current document) plus a static built-in attribute list.
     b. **Include path completion**: triggers on `include::` followed by partial text; calls the project file-tree endpoint (via `use-include-completions.ts` which caches the result and refreshes on tree-change events).
     c. **Cross-reference completion**: triggers on `<<`; matches against section IDs (derived from section heading text) and explicit anchor definitions (`[[id]]`, `[#id]`) in the current document.
   - All sources scoped to current document/project only (FR-LF-005 compliance).
5. Implement `use-include-completions.ts`:
   - Fetches `GET /projects/:projectId/tree` on editor mount.
   - Flattens the tree to a list of file paths.
   - Exposes the list to `asciidoc-completions.ts`.
   - Reacts to file-tree SSE events to invalidate and refresh the cache.

**Tests**:
- `asciidoc-outline.ts`: unit tests asserting correct extraction from various document structures (nested headings, no headings, headings after blocks).
- `asciidoc-completions.ts`: unit tests for each completion source — verify correct candidates, correct trigger positions, no out-of-project paths.
- `EditorSectionOutline` component: renders headings, click scrolls (mock CM6 view dispatch).
- `use-include-completions`: fetch called once on mount; cache invalidated on tree-change event.

6. Implement `asciidoc-link-handler.ts` (FR-LF-006, FR-LF-007):
   - CM6 `ViewPlugin` that intercepts `mousedown` events with `Ctrl` (or `Meta` on macOS) held
   - Uses `view.posAtCoords()` to find the document position; walks the Lezer parse tree to identify the enclosing node type (include path, link URL, xref target)
   - **Include paths / cross-references**: extract the path, validate it is within the project (no `..` traversal, no absolute paths), call `onNavigateToFile(path)`; show a non-blocking toast for unresolvable paths
   - **Link URLs**: extract the href, call `onOpenUrl(href)` — consumer calls `window.open(href, '_blank', 'noopener,noreferrer')`
   - Export as `createLinkHandler({ onNavigateToFile, onOpenUrl }): Extension`
7. Wire `createLinkHandler` into `AsciiDocEditor`: accept `onNavigateToFile?: (path: string) => void` and `onOpenUrl?: (url: string) => void` props; in `project-editor-layout.tsx`, pass `onNavigateToFile` that selects the file in the existing file-tree state and `onOpenUrl` that opens the URL in a new tab.

**Tests**:
- `asciidoc-link-handler.ts`: unit tests for include navigation, URL opening, path-escape suppression, no-op on plain content, no-op without Ctrl key.

**Milestone 5 passes when**: The section outline panel lists all headings and click-scrolls work; attribute/include/xref completions appear in appropriate positions; no paths outside the current project appear in completion candidates; Ctrl+click on an include path loads the target file in the panel; Ctrl+click on a URL opens a new tab.

---

### Milestone 6 — Accessibility, Multi-Cursor, Code Folding & E2E (P3)

*Goal*: All keyboard accessibility requirements met; multi-cursor and code folding work; E2E tests cover the complete editing workflow.

**Scope**:
1. Verify and complete `asciidoc-fold.ts` (implemented in Milestone 1) — ensure all delimited block types fold correctly; fix any gaps found during E2E testing.
2. Confirm `foldGutter()` from `@codemirror/language` is wired into the editor extension set (done in Milestone 1 T012; no separate `@codemirror/fold` package is needed in CM6 6.x).
3. Verify multi-cursor (`Alt+Click`, `Ctrl+D`) using the `defaultKeymap` (already included in CM6 standard keymaps).
4. Keyboard accessibility audit:
   - All toolbar buttons: reachable via `Tab`, activated via `Enter`/`Space`, tooltips shown on focus.
   - Find panel: reachable via keyboard shortcut, navigable with `Tab`/`Shift+Tab`, closed with `Escape`.
   - Section outline panel: list items focusable and activatable by keyboard.
   - Settings panel: all controls keyboard-accessible.
   - Focus order follows logical reading order through chrome.
5. ARIA labels audit: all icon buttons, panels, and interactive elements have `aria-label`.
6. High-contrast theme: verify all token colours meet WCAG AA contrast ratio against the background.
7. E2E tests (Playwright):
   - Open a project, select a `.adoc` file, verify syntax highlighting is applied (check for presence of highlighted class names).
   - Type content, wait 5 s, refresh page, verify content persists.
   - Open find panel, search for a term, verify match count and replace.
   - Open section outline, click a heading, verify editor scrolled.
   - Change font size in settings, verify editor font-size CSS updated.
   - Viewer role: open file in read-only mode, attempt to type, verify nothing is inserted.

**Milestone 6 passes when**: 100% of keyboard accessibility checklist passes; all E2E tests green; code folding and multi-cursor confirmed working; WCAG AA contrast verified for high-contrast theme.

---

## Complexity Tracking

No Architecture Constitution violations in this plan. All patterns follow established conventions (entity/port/use-case, Prisma adapter, in-memory fake, `tests/` directory layout).

The only area of elevated complexity is the Lezer grammar. This is **inherent complexity** — AsciiDoc's document model requires a purpose-built parser; there are no published alternatives. The grammar is scoped to the FR-ED-002 subset to keep it manageable, with incremental error recovery to handle in-progress edits.
