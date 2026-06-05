# Tasks: AsciiDoc Code Editor

**Input**: Design documents from `specs/014-codemirror-editor/`

**Prerequisites**: plan.md ✓ spec.md ✓ research.md ✓ data-model.md ✓ contracts/editor-api.md ✓ quickstart.md ✓

**TDD**: Constitution mandates Red → Green → Refactor for all production code. Every implementation task is preceded by a test task. Write the test, confirm it fails, then implement.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase (different files, no shared state)
- **[Story]**: User story this task belongs to (US1–US8 per spec.md)
- All paths are relative to repo root

## Path Conventions

| Package / App             | Source root                    | Test root                        |
|---------------------------|--------------------------------|----------------------------------|
| `packages/domain`         | `packages/domain/src/`         | `packages/domain/tests/`         |
| `packages/infrastructure` | `packages/infrastructure/src/` | `packages/infrastructure/tests/` |
| `apps/api`                | `apps/api/src/`                | `apps/api/tests/`                |
| `apps/web`                | `apps/web/src/`                | `apps/web/tests/`                |

Never use `__tests__/` directories. Never co-locate test files with source files.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and configure the build pipeline before any implementation begins.

- [X] T001 Install CodeMirror 6 and Lezer packages in `apps/web`: `@codemirror/state` `@codemirror/view` `@codemirror/commands` `@codemirror/language` `@codemirror/search` `@codemirror/autocomplete` `@lezer/common` `@lezer/lr` `@lezer/highlight`; install `@lezer/generator` as devDependency; install `@uiw/codemirror-extensions-minimap`
- [X] T002 [P] Add `prebuild` script to `apps/web/package.json` that runs `lezer-generator src/lib/codemirror/asciidoc.grammar --output src/lib/codemirror/asciidoc-parser.js`; verify it is called by the existing `build` script
- [X] T003 [P] Add `NEXT_PUBLIC_EDITOR_AUTOSAVE_DEBOUNCE_MS=4000` to `apps/web/.env.example`; create `apps/web/src/lib/codemirror/constants.ts` exporting `AUTOSAVE_DEBOUNCE_MS`, `EXTERNAL_CHANGE_POLL_INTERVAL_MS` (30000), `FONT_SIZE_MIN` (8), `FONT_SIZE_MAX` (32), `OFFLINE_QUEUE_KEY_PREFIX` (`'asciidocollab:editor-draft:'`)
- [X] T004 [P] Create `packages/shared/src/dtos/editor-preferences.dto.ts` with `EditorPreferencesDto` and `UpdateEditorPreferencesDto` interfaces; export from `packages/shared/src/index.ts`

**Checkpoint**: `pnpm --filter @asciidocollab/web build` succeeds (grammar compile step runs even with empty grammar file placeholder).

---

## Phase 2: Foundational (AsciiDoc Lezer Grammar)

**Purpose**: The Lezer grammar and CM6 language extension are required by every subsequent user story. Nothing else can be built until these pass.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Write grammar unit tests in `apps/web/tests/lib/codemirror/asciidoc-grammar.test.ts` covering all FR-ED-002 token types: document title, section headings (levels 1–5), bold/italic/monospace/highlight/subscript/superscript inline marks, delimited blocks (listing, example, sidebar, quote, passthrough, open), STEM blocks, comment lines and comment blocks, attribute references, attribute entries, block/inline macros, cross-references, footnotes, ordered/unordered/checklist list items, description lists (standard, horizontal, Q&A), table syntax (`|===`), admonition paragraphs and blocks — each assertion checks that the Lezer `Tree` contains the expected node type at the expected position. Run tests: confirm ALL fail (RED).
- [X] T006 Author `apps/web/src/lib/codemirror/asciidoc.grammar` implementing all token types from T005; compile to `apps/web/src/lib/codemirror/asciidoc-parser.js` via `pnpm --filter @asciidocollab/web prebuild`; run tests from T005: confirm all pass (GREEN). Enable incremental error recovery (`@recoverWith`) on all block-level rules.
- [X] T007 Implement `apps/web/src/lib/codemirror/asciidoc-language.ts`: export `asciidocLanguage` as a CM6 `LRLanguage` wrapping the compiled parser; export `asciidoc()` convenience function returning a `LanguageSupport` object.
- [X] T008 [P] Implement `apps/web/src/lib/codemirror/asciidoc-highlight.ts`: define a CM6 `HighlightStyle` mapping every grammar node type to a distinct `Tag`; every FR-ED-002 token type must have a visually distinct style. Export as `asciidocHighlightStyle`.
- [X] T009 [P] Implement `apps/web/src/lib/codemirror/asciidoc-fold.ts`: export a CM6 `foldService` that folds delimited blocks (listing, example, sidebar, quote, passthrough, open, STEM, comment blocks) and section content bodies. Export as `asciidocFold`.

**Checkpoint**: All grammar tests green; `asciidocLanguage`, `asciidocHighlightStyle`, and `asciidocFold` are importable from their files. ⚠️ No `any` type or `as` casts in any produced file — use Lezer's `NodeType`, `SyntaxNode`, and CM6's typed extension APIs throughout (P0 constitution violation if violated).

---

## Phase 3: User Story 1 — Edit with Syntax Highlighting (Priority: P1) 🎯 MVP

**Goal**: AsciiDoc files open in a CM6 editor with full syntax highlighting. Read-only for viewers. Replaces `FileContentPanel`.

**Independent Test**: Open a `.adoc` file → observe coloured token rendering; switch to viewer role → confirm no typing is accepted.

- [X] T010 Write tests for `AsciiDocEditor` in `apps/web/tests/components/editor/asciidoc-editor.test.tsx`: (1) renders a CM6 editor element (not a `<pre>`) when given text content; (2) the editor is read-only when `canEdit={false}` — typing produces no change; (3) the editor is editable when `canEdit={true}`; (4) component unmounts without errors. Run tests: confirm all fail (RED).
- [X] T011 [US1] Implement `apps/web/src/components/editor/asciidoc-editor.tsx`: create a `'use client'` component that wraps `EditorView`; configure extensions: `asciidoc()`, `asciidocHighlightStyle`, `history()`, `historyKeymap`, `defaultKeymap`, `EditorState.readOnly.of(!canEdit)`; accept props `content: string`, `canEdit: boolean`, `onChange?: (value: string) => void`; call `onChange` via `updateListener`. Run T010: confirm all pass (GREEN).
- [X] T012 [P] [US1] Wire `asciidocFold` and CM6 `foldGutter()` into `AsciiDocEditor` extension set in `apps/web/src/components/editor/asciidoc-editor.tsx`.
- [X] T013 [US1] Three-file change to wire `canEdit` through the server-component chain and replace `FileContentPanel`:
  1. **`apps/web/src/lib/get-project-access.ts`**: widen the `fetchJson<>` type on the `/auth/me` call from `{ userId: string; displayName: string; email: string }` to `{ userId: string; displayName: string; email: string; isAdmin: boolean }`; add `isAdmin: boolean` to the `ProjectAccess` return interface and return it.
  2. **`apps/web/src/app/(dashboard)/dashboard/projects/[id]/page.tsx`**: read `isAdmin` from the `getProjectAccess()` result; compute `canEdit = (currentUserRole === 'editor' || currentUserRole === 'owner') || isAdmin`; keep `canManage = currentUserRole === 'owner'` unchanged (this guards the Settings/Members nav links and must remain owner-only); pass both `canEdit` and `canManage` as props to `ProjectEditorLayout`.
  3. **`apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx`**: add `canEdit: boolean` to `ProjectEditorLayoutProperties`; replace `<FileContentPanel>` with `<AsciiDocEditor canEdit={canEdit} ...>`; keep all existing `isOwner`-gated UI (Settings/Members links) using `canManage` — do not widen that gate; pass `content={contentState.content ?? ''}` and handle loading/binary/error states around the editor.

**Checkpoint**: Navigate to a project, select a `.adoc` file — syntax-highlighted editor renders. A viewer cannot type. `FileContentPanel` is removed.

---

## Phase 4: User Story 2 — Auto-Save (Priority: P1)

**Goal**: Changes persist automatically after 4 s of inactivity. Save state always visible. External changes notify without overwriting in-progress edits.

**Independent Test**: Type text → wait 5 s → refresh page → content present. Save badge transitions: unsaved → saving → saved. Kill network → see error badge.

- [X] T014 Write tests for `useAutoSave` in `apps/web/tests/hooks/use-auto-save.test.ts` using stub `fetch` and a fake `localStorage`: (1) `saveState` starts as `'saved'`; (2) calling the returned `save(content)` transitions state to `'unsaved'`; (3) after debounce delay, state transitions `'saving'` → `'saved'` when PUT succeeds; (4) on PUT failure, state becomes `'error'` and retries once after 5 s; (5) `beforeunload` listener is registered when state is `'unsaved'` or `'error'`; (6) polling HEAD at `EXTERNAL_CHANGE_POLL_INTERVAL_MS` calls `onExternalChange` when ETag differs; (7) when `navigator.onLine` is `false` and `save(content)` is called, content is written to `localStorage` under `OFFLINE_QUEUE_KEY_PREFIX + fileNodeId` instead of fetching; (8) firing the `online` window event while a draft exists in `localStorage` triggers a PUT with the queued content and clears the draft; (9) on `beforeunload` with `saveState !== 'saved'`, a `fetch` with `{ keepalive: true }` is dispatched with the current unsaved content; (10) on mount, if `localStorage` contains a draft for `fileNodeId`, `onDraftRecovered` is called with the stored content. Run tests: confirm all fail (RED).
- [X] T015 [P] [US2] Implement `apps/web/src/hooks/use-auto-save.ts`: accepts `projectId`, `fileNodeId`, `onExternalChange?` callback, `onDraftRecovered?` callback; debounces PUT to `/projects/:projectId/files/:fileNodeId/content` by `AUTOSAVE_DEBOUNCE_MS`; maintains `saveState: EditorSaveState`; stores received ETag; polls HEAD with `If-None-Match` at `EXTERNAL_CHANGE_POLL_INTERVAL_MS`; calls `onExternalChange` on 200; registers/removes `beforeunload` listener; on `beforeunload` with unsaved content dispatches `fetch(url, { method: 'PUT', body, keepalive: true })`; listens to `window` `offline`/`online` events — when offline writes content to `localStorage[OFFLINE_QUEUE_KEY_PREFIX + fileNodeId]`, when online flushes the draft via PUT and clears the entry; on mount checks `localStorage` for a draft and calls `onDraftRecovered` if present. Run T014: confirm all pass (GREEN).
- [X] T016 [P] [US2] Add `ETag` response header to `GET /projects/:projectId/files/:fileNodeId/content` in `apps/api/src/routes/projects/file-content.ts`: set `ETag: \`"${result.value.contentId}"\`` (use the `contentId` from the document entity returned by `GetDocumentContentUseCase`; requires a small extension to the use case result or a separate document lookup).
- [X] T017 Write tests for `EditorStatusBar` in `apps/web/tests/components/editor/editor-status-bar.test.tsx`: (1) renders line number, column number, total lines; (2) renders save state badge with correct text for each `EditorSaveState` value (`'saved'`, `'saving'`, `'unsaved'`, `'error'`); (3) `'error'` state shows a retry button. Run tests: confirm all fail (RED).
- [X] T018 [US2] Implement `apps/web/src/components/editor/editor-status-bar.tsx`: reads `line`, `col`, `totalLines` from CM6 `EditorView.state`; accepts `saveState: EditorSaveState`; renders a compact status bar. Run T017: confirm all pass (GREEN).
- [X] T019 [US2] Wire `useAutoSave` and `EditorStatusBar` into `apps/web/src/components/editor/asciidoc-editor.tsx`: subscribe `onChange` to `useAutoSave`; pass `saveState` to `EditorStatusBar`; show a non-blocking toast via the existing toast/notification pattern when `onExternalChange` fires; show a dismissible recovery banner (with "Restore" and "Discard" actions) when `onDraftRecovered` fires — "Restore" replaces the editor content with the draft and triggers a save, "Discard" removes the draft from `localStorage`.

**Checkpoint**: Edit a file → badge shows "unsaved" → after 4 s shows "saved" → refresh → content persists. Disconnect network → badge shows "error" with retry button; content written to localStorage. Reconnect → auto-flush. Close tab with unsaved changes → keepalive fetch dispatched. Reopen same file after offline close → recovery banner appears.

---

## Phase 5: User Story 4 — Find and Replace (Priority: P2)

**Goal**: Full find/replace panel with regex support, match count, and navigation, accessible by keyboard.

**Independent Test**: Open find panel with keyboard shortcut → type a term → match count visible → Tab to replace field → replace all → document updated.

- [X] T020 Write tests for find/replace in `apps/web/tests/components/editor/asciidoc-editor-find.test.tsx`: (1) find panel opens when keyboard shortcut is dispatched; (2) typing a search term produces visible match highlights and a match count; (3) "next" and "previous" navigate between matches; (4) replace field replaces current match; (5) "replace all" replaces every match; (6) enabling regex toggle with a valid regex finds matches; (7) enabling regex toggle with an invalid regex shows an error indicator and does not crash the editor. Run tests: confirm all fail (RED).
- [X] T021 [US4] Add `@codemirror/search` extension to `AsciiDocEditor` in `apps/web/src/components/editor/asciidoc-editor.tsx`: configure `search({ top: true })`, `findAndReplace`, and `searchKeymap`; ensure the find panel is keyboard-dismissible (`Escape`) and focus-trapped when open. Run T020: confirm all pass (GREEN).

**Checkpoint**: Find panel opens, all T020 assertions pass. Escape closes the panel. The editor does not crash on invalid regex.

---

## Phase 6: User Story 5 — Formatting Toolbar (Priority: P2)

**Goal**: A grouped toolbar lets authors insert and wrap AsciiDoc constructs without memorising syntax.

**Independent Test**: Select text → click Bold → text wrapped in `*asterisks*`. Click Code Block with no selection → listing block snippet inserted. Hover toolbar button → tooltip with name and shortcut visible.

- [X] T022 Write tests for `EditorToolbarButton` in `apps/web/tests/components/editor/editor-toolbar-button.test.tsx`: (1) renders an icon button with `aria-label`; (2) tooltip appears on hover; (3) tooltip appears on keyboard focus; (4) clicking calls the provided `onClick` handler; (5) keyboard `Enter` and `Space` activate the button. Run tests: confirm all fail (RED).
- [X] T023 [P] [US5] Implement `apps/web/src/components/editor/editor-toolbar-button.tsx`: icon button with Radix `Tooltip` (name + shortcut in content), `aria-label`, keyboard activation. Run T022: confirm all pass (GREEN).
- [X] T024 Write tests for `EditorToolbar` in `apps/web/tests/components/editor/editor-toolbar.test.tsx`: (1) renders four labelled groups (Text Formatting, Structure, Blocks, Inline/References); (2) clicking Bold wraps selected text in `**...**`; (3) clicking Code Block with no selection inserts a `----\n\n----` snippet; (4) clicking Heading 2 inserts `== ` at line start; (5) a "More…" overflow button appears when the container width is below a threshold; (6) all buttons in each group are accessible by Tab. Run tests: confirm all fail (RED).
- [X] T025 [US5] Implement `apps/web/src/components/editor/editor-toolbar.tsx`: four groups per FR-EC-001 (Text Formatting: Bold, Italic, Monospace, Highlight, Subscript, Superscript; Structure: Heading 1–5, Ordered list, Unordered list, Checklist, Description list standard/horizontal/Q&A; Blocks: Code block, Example block, Sidebar, Blockquote, NOTE/TIP/WARNING/IMPORTANT/CAUTION admonitions, STEM block, Comment block; Inline/References: Link, Cross-reference, Footnote, Image); each button dispatches the appropriate CM6 command (wrap selection or insert snippet); ResizeObserver collapses overflowing buttons into a Radix `DropdownMenu` labelled "More…". Run T024: confirm all pass (GREEN).
- [X] T026 [US5] Wire `EditorToolbar` into `apps/web/src/components/editor/asciidoc-editor.tsx`: pass the `EditorView` ref to the toolbar; render toolbar above the CM6 editor surface; hide toolbar when `canEdit` is false.

**Checkpoint**: Toolbar visible in editor; all FR-EC-001 actions insert or wrap correctly; overflow dropdown appears on narrow viewports; viewer sees no toolbar.

---

## Phase 7: User Story 3 — Section Outline (Priority: P2)

**Goal**: A live section outline panel lets authors jump to any heading without scrolling.

**Independent Test**: Open a file with five headings → outline lists all five with correct indentation → click third heading → editor scrolls to that line.

- [X] T027 Write tests for `asciidoc-outline.ts` in `apps/web/tests/lib/codemirror/asciidoc-outline.test.ts`: (1) extracts correct level, title text, and line number for a document with headings at levels 1–5; (2) returns empty array for a document with no headings; (3) handles headings that immediately follow delimited blocks; (4) StateField updates when a heading is added or removed in a CM6 transaction. Run tests: confirm all fail (RED).
- [X] T028 [P] [US3] Implement `apps/web/src/lib/codemirror/asciidoc-outline.ts`: CM6 `StateField<SectionOutlineEntry[]>` that walks the Lezer parse tree on every transaction to extract heading nodes; export `outlineField` and `SectionOutlineEntry` type. Run T027: confirm all pass (GREEN).
- [X] T029 Write tests for `useSectionOutline` in `apps/web/tests/hooks/use-section-outline.test.ts`: hook subscribes to the CM6 view; updates when the document changes; returns empty array when no headings present. Run tests: confirm all fail (RED).
- [X] T030 [P] [US3] Implement `apps/web/src/hooks/use-section-outline.ts`: subscribes to `EditorView` via `useEffect` + view update listener; reads `outlineField` from editor state; returns current `SectionOutlineEntry[]`. Run T029: confirm all pass (GREEN).
- [X] T031 Write tests for `EditorSectionOutline` in `apps/web/tests/components/editor/editor-section-outline.test.tsx`: (1) renders headings in order with indent proportional to level; (2) clicking a heading fires a callback with the heading's line number; (3) renders empty-state message when outline is empty; (4) all heading entries are focusable and activatable by keyboard. Run tests: confirm all fail (RED).
- [X] T032 [US3] Implement `apps/web/src/components/editor/editor-section-outline.tsx`: hierarchical list using indent per level; clicking an entry calls `EditorView.dispatch` to move cursor and scroll; live-updated via `useSectionOutline`; keyboard navigable (`Tab`, `Enter`); empty-state message. Run T031: confirm all pass (GREEN).
- [X] T033 [US3] Wire `EditorSectionOutline` into `apps/web/src/components/editor/asciidoc-editor.tsx` as a collapsible side panel (toggle button, panel visible by default, width ~220 px); only render for AsciiDoc files.

**Checkpoint**: Section outline panel visible; all headings listed with correct indentation; clicking any heading scrolls editor; typing a new heading updates outline immediately.

---

## Phase 8: User Story 7 — Editor Preferences & Appearance (Priority: P3)

**Goal**: Users customise font size and theme; preferences persist server-side and survive page reloads and device switches. Minimap visible.

**Independent Test**: Change font size → editor text resizes immediately. Select high-contrast theme → colours change. Reload page → both preferences restored.

### Domain

- [X] T034 [P] Write tests for `EditorPreferencesId` value object in `packages/domain/tests/value-objects/editor-preferences-id.test.ts`: constructs from valid UUID; rejects empty string. Run tests: confirm all fail (RED).
- [X] T035 [P] Write tests for `EditorTheme` value object in `packages/domain/tests/value-objects/editor-theme.test.ts`: `parse('default')` succeeds; `parse('high-contrast')` succeeds; `parse('unknown')` returns `ValidationError`. Run tests: confirm all fail (RED).
- [X] T036 [P] [US7] Implement `packages/domain/src/value-objects/editor-preferences-id.ts` (branded UUID, same pattern as `DocumentId`). Run T034: confirm all pass (GREEN).
- [X] T037 [P] [US7] Implement `packages/domain/src/value-objects/editor-theme.ts` (`'default' | 'high-contrast'` union + `parse()` factory returning `Result<EditorTheme, ValidationError>`). Run T035: confirm all pass (GREEN).
- [X] T038 Write tests for `EditorPreferences` entity in `packages/domain/tests/entities/editor-preferences.test.ts`: (1) constructs with valid fields; (2) `fontSize` below 8 throws `ValidationError`; (3) `fontSize` above 32 throws `ValidationError`; (4) `updatedAt` reflects construction timestamp. Run tests: confirm all fail (RED).
- [X] T039 [US7] Implement `packages/domain/src/entities/editor-preferences.ts`: entity with `id: EditorPreferencesId`, `userId: UserId`, `fontSize: number` (validates 8–32 in constructor), `theme: EditorTheme`, `timestamps: Timestamps`. Run T038: confirm all pass (GREEN).
- [X] T040 [US7] Implement `packages/domain/src/ports/user/editor-preferences.repository.ts`: interface with `findByUserId(userId: UserId): Promise<EditorPreferences | null>` and `save(prefs: EditorPreferences): Promise<void>` (upsert).
- [X] T041 [US7] Implement `packages/domain/tests/ports/user/in-memory-editor-preferences.repository.ts`: `Map<string, EditorPreferences>` keyed by `userId.value`; `save` upserts; `findByUserId` returns null when absent. (No RED/GREEN cycle — this is the fake itself, not production code. The Governance Constitution exempts in-memory fakes from the TDD cycle because correctness is verified indirectly: T042 and T044 use this fake as their repository; any bug in the fake will surface as a test failure there.)
- [X] T042 [P] Write tests for `GetEditorPreferencesUseCase` in `packages/domain/tests/use-cases/settings/get-editor-preferences.test.ts` using `InMemoryEditorPreferencesRepository`: (1) returns existing record when found; (2) returns default preferences (`fontSize: 14`, `theme: 'default'`) when no record found; (3) never returns an error. Run tests: confirm all fail (RED).
- [X] T043 [P] Write tests for `SaveEditorPreferencesUseCase` in `packages/domain/tests/use-cases/settings/save-editor-preferences.test.ts` using `InMemoryEditorPreferencesRepository`: (1) valid inputs persist and can be retrieved; (2) `fontSize: 7` returns `ValidationError`; (3) `fontSize: 33` returns `ValidationError`; (4) `theme: 'neon'` returns `ValidationError`; (5) second save for same user upserts (no duplicate record). Run tests: confirm all fail (RED).
- [X] T044 [P] [US7] Implement `packages/domain/src/use-cases/settings/get-editor-preferences.ts`: calls `findByUserId`; if null, returns a default `EditorPreferences` value (not persisted). Run T042: confirm all pass (GREEN).
- [X] T045 [P] [US7] Implement `packages/domain/src/use-cases/settings/save-editor-preferences.ts`: validates `fontSize` ∈ [8, 32] and `theme` via `EditorTheme.parse()`; on validation failure returns `ValidationError`; on success upserts via `EditorPreferencesRepository`. Run T043: confirm all pass (GREEN).
- [X] T046 [US7] Export all new domain types from index files: `packages/domain/src/entities/index.ts` (EditorPreferences), `packages/domain/src/value-objects/index.ts` (EditorPreferencesId, EditorTheme), `packages/domain/src/ports/index.ts` (EditorPreferencesRepository), `packages/domain/src/use-cases/index.ts` (GetEditorPreferencesUseCase, SaveEditorPreferencesUseCase), `packages/domain/src/index.ts`.

### Infrastructure + Database

- [X] T047 [US7] Add `EditorPreferences` model to `packages/db/prisma/schema.prisma`: fields `id String @id @default(uuid())`, `userId String @unique`, `fontSize Int @default(14)`, `theme String @default("default")`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`; add `@@map("editor_preferences")`; add the inverse relation field on the `User` model. (Do NOT run `prisma migrate` — schema change only, per Architecture Constitution database migration policy.)
- [X] T048 Write integration tests for `PrismaEditorPreferencesRepository` in `packages/infrastructure/tests/persistence/user/prisma-editor-preferences.repository.test.ts` using testcontainers: (1) `findByUserId` returns null when no record; (2) `save` creates a new record; (3) `findByUserId` returns the saved record; (4) calling `save` again for the same user updates the existing record (upsert). Run tests: confirm all fail (RED).
- [X] T049 [US7] Implement `packages/infrastructure/src/persistence/user/prisma-editor-preferences.repository.ts`: Prisma `upsert` in `save`; map DB row to `EditorPreferences` entity and vice versa. Run T048: confirm all pass (GREEN).
- [X] T050 [US7] Export `PrismaEditorPreferencesRepository` from `packages/infrastructure/src/index.ts`.

### API

- [X] T051 Write route tests for editor preferences in `apps/api/tests/routes/editor-preferences.test.ts`: (1) `GET /auth/me/editor-preferences` returns `{ fontSize: 14, theme: "default" }` when no record exists; (2) returns saved values after a PUT; (3) `PUT /auth/me/editor-preferences` with valid body returns 204; (4) `PUT` with `fontSize: 7` returns 400; (5) `PUT` with `theme: "neon"` returns 400; (6) both routes return 401 when unauthenticated. Run tests: confirm all fail (RED).
- [X] T052 [US7] Implement `apps/api/src/routes/editor-preferences.ts`: `GET` delegates to `GetEditorPreferencesUseCase` and returns `EditorPreferencesDto`; `PUT` validates body with Fastify JSON schema (`fontSize` integer 8–32, `theme` enum), delegates to `SaveEditorPreferencesUseCase`, returns 204; both routes require `requireAuth` plugin. Run T051: confirm all pass (GREEN).
- [X] T053 [US7] Register editor-preferences routes in `apps/api/src/index.ts`; wire `PrismaEditorPreferencesRepository` at the composition root (same pattern as existing repo wiring).

### Frontend

- [X] T054 Write tests for `useEditorPreferences` in `apps/web/tests/hooks/use-editor-preferences.test.ts` using stub `fetch`: (1) applies localStorage value immediately on mount before API response arrives; (2) overwrites with API response when received; (3) `PUT` is called 500 ms after a preference change; (4) localStorage is updated immediately on change (before PUT completes). Run tests: confirm all fail (RED).
- [X] T055 [US7] Implement `apps/web/src/hooks/use-editor-preferences.ts`: read from localStorage on mount; fetch `GET /auth/me/editor-preferences` (authoritative); debounce `PUT` 500 ms on change; write-through to localStorage; expose `{ fontSize, theme, setFontSize, setTheme }`. Run T054: confirm all pass (GREEN).
- [X] T056 Write tests for `EditorSettingsPanel` in `apps/web/tests/components/editor/editor-settings-panel.test.tsx`: (1) renders font size stepper showing current value; (2) incrementing/decrementing calls `setFontSize`; (3) theme dropdown renders both options and calls `setTheme` on selection; (4) all controls are keyboard-accessible. Run tests: confirm all fail (RED).
- [X] T057 [US7] Implement `apps/web/src/components/editor/editor-settings-panel.tsx`: font size stepper/input (range 8–32 with increment/decrement buttons); theme `<select>` or Radix `Select` (options: "Default", "High Contrast"); delegates to `useEditorPreferences`. Run T056: confirm all pass (GREEN).
- [X] T058 [P] [US7] Add `@uiw/codemirror-extensions-minimap` to `AsciiDocEditor` extension set in `apps/web/src/components/editor/asciidoc-editor.tsx`; configure minimap canvas dimensions and colours.
- [X] T059 [US7] Apply `EditorPreferences` to `AsciiDocEditor` in `apps/web/src/components/editor/asciidoc-editor.tsx`: set `--editor-font-size` CSS custom property from `fontSize`; toggle `data-theme="high-contrast"` attribute on the editor container; wire `EditorSettingsPanel` into the editor chrome (settings gear icon opens a popover/panel); expose settings toggle button in the toolbar or status bar.

**Checkpoint**: Font size slider changes editor text size immediately. High-contrast theme toggles without reload. Reload page → both preferences restored. Minimap visible and scrolls the editor.

---

## Phase 9: User Story 8 + User Story 9 — Auto-Completion & Ctrl+Click Navigation (Priority: P3/P2)

**Goal**: Contextual completions for AsciiDoc attributes, include paths, and cross-references appear as the user types. Ctrl+clicking an include path or link navigates to the target.

**Independent Test**: Type `{doc` → dropdown lists matching attributes. Type `include::src/` → dropdown lists files. Type `<<sec` → dropdown lists section IDs. Select a completion → full text inserted. No project-external paths appear. Ctrl+click `include::chapters/intro.adoc[]` → file tree selects `intro.adoc`, editor loads it.

- [X] T060 Write tests for `asciidoc-completions.ts` in `apps/web/tests/lib/codemirror/asciidoc-completions.test.ts`: (1) attribute source triggers on `{`, returns doc-defined attributes from `:attr: value` entries; (2) attribute source includes built-in AsciiDoc attributes (`{author}`, `{revdate}`, `{toc}`, etc.); (3) include source triggers on `include::`, returns paths provided by the include-completions provider; (4) xref source triggers on `<<`, returns section IDs derived from heading text and explicit anchor definitions (`[[id]]`, `[#id]`); (5) no completion source returns paths that were not in the project file list; (6) `Tab` or `Enter` inserts the selected candidate; (7) pressing `Escape` while the dropdown is visible closes it without inserting anything and leaves the document unchanged. Run tests: confirm all fail (RED).
- [X] T061 [P] [US8] Implement attribute and cross-reference completion sources in `apps/web/src/lib/codemirror/asciidoc-completions.ts`: parse document state for `:attr: value` entries (attribute completion) and section headings / anchor definitions (xref completion); maintain a static built-in attribute list; export each source as a CM6 `CompletionSource`. Run T060 assertions 1–2 and 4–5: confirm those pass (GREEN).
- [X] T062 Write tests for `useIncludeCompletions` in `apps/web/tests/hooks/use-include-completions.test.ts`: (1) fetches `GET /projects/:projectId/tree` on mount; (2) flattens nested tree to a list of relative file paths; (3) re-fetches when a file-tree SSE event is received; (4) returns empty array before fetch completes. Run tests: confirm all fail (RED).
- [X] T063 [P] [US8] Implement `apps/web/src/hooks/use-include-completions.ts`: fetch project tree on mount; flatten to `string[]` of relative paths; subscribe to the existing file-tree SSE event source to invalidate and refresh the cache on file create/rename/delete events; expose the path list. Run T062: confirm all pass (GREEN).
- [X] T064 [US8] Implement the include-path completion source in `apps/web/src/lib/codemirror/asciidoc-completions.ts` consuming the path list from `useIncludeCompletions` (injected as a CM6 extension config parameter); export `createIncludeCompletionSource(paths: string[]): CompletionSource`. Run T060 assertion 3: confirm it passes (GREEN).
- [X] T065 [US8] Register all three completion sources in `apps/web/src/components/editor/asciidoc-editor.tsx`: add `autocompletion({ override: [attributeCompletionSource, createIncludeCompletionSource(includePaths), xrefCompletionSource] })` to the extension set; wire `useIncludeCompletions` inside the component to obtain `includePaths`.
- [X] T076 Write tests for `asciidoc-link-handler.ts` in `apps/web/tests/lib/codemirror/asciidoc-link-handler.test.ts`: (1) Ctrl+click on an `include::path/to/file.adoc[]` node calls `onNavigateToFile` with `'path/to/file.adoc'`; (2) Ctrl+click on `link:https://example.com[label]` calls `onOpenUrl` with `'https://example.com'`; (3) Ctrl+click on a bare `https://example.com` URL calls `onOpenUrl`; (4) Ctrl+click on an `include::` path containing `..` does not call either callback; (5) Ctrl+click on an absolute include path (e.g. `/etc/passwd`) does not call either callback; (6) a plain click (no Ctrl) does not trigger navigation; (7) Ctrl+click on non-navigable content (body text, heading marker) does not call either callback; (8) an unresolvable `include::` path (not in the project file list) calls a provided `onUnresolvedPath` callback with the raw path. Run tests: confirm all fail (RED).
- [X] T077 [P] [US9] Implement `apps/web/src/lib/codemirror/asciidoc-link-handler.ts`: CM6 `ViewPlugin` that intercepts `mousedown` events when `event.ctrlKey || event.metaKey`; uses `view.posAtCoords({ x: event.clientX, y: event.clientY })` to get the document position; walks the Lezer parse tree at that position to identify the enclosing node (include macro path, link URL, xref target); for include/xref paths: (a) apply `decodeURIComponent()` to the raw extracted path to normalise percent-encoded characters (e.g. `%2e%2e` → `..`), (b) apply `path.normalize()` (or equivalent browser-safe normalisation) to canonicalise the result, (c) reject any path that starts with `/`, contains a `..` segment after normalisation, or resolves outside the project root — call `onUnresolvedPath(rawPath)` for rejected paths; for accepted paths call `onNavigateToFile(resolvedPath)`; for link URLs calls `onOpenUrl(href)`; export as `createLinkHandler(callbacks: LinkHandlerCallbacks): Extension`. Do not use `any` or `as` casts — use proper Lezer `NodeType` and `SyntaxNode` APIs throughout. Run T076: confirm all pass (GREEN).
- [X] T078 [US9] Wire `createLinkHandler` into `apps/web/src/components/editor/asciidoc-editor.tsx`: accept `onNavigateToFile?: (path: string) => void` and `onOpenUrl?: (url: string) => void` props; add `createLinkHandler({ onNavigateToFile, onOpenUrl, onUnresolvedPath: (p) => toast(`File not found: ${p}`) })` to the extension set; in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` pass `onNavigateToFile` that dispatches to the existing file-tree state to select the file and loads it in the editor panel, and `onOpenUrl` that calls `window.open(url, '_blank', 'noopener,noreferrer')`.

**Checkpoint**: All three completion types appear on trigger. No paths outside the current project appear. `Escape` closes the dropdown. Ctrl+click on `include::` loads the referenced file in the panel. Ctrl+click on a URL opens a new tab. ⚠️ No `any` type or `as` casts in completion sources or link-handler — use CM6's `CompletionContext`, `CompletionResult`, and Lezer `SyntaxNode` APIs with their proper types (P0 constitution violation if violated).

---

## Phase 10: User Story 6 — Productivity, Accessibility & E2E (Priority: P3)

**Goal**: Code folding, multi-cursor, minimap (already added in T058), full keyboard accessibility, high-contrast theme, and a complete E2E test suite.

**Independent Test**: Fold a listing block → single delimiter line visible. Add second cursor → text typed appears at both positions. Tab through all editor controls without mouse.

- [X] T066 [P] Verify `asciidocFold` folds all delimited block types: write focused tests for each block type (listing, example, sidebar, quote, passthrough, open, STEM, comment) in `apps/web/tests/lib/codemirror/asciidoc-fold.test.ts`; fix any block types that do not fold correctly in `apps/web/src/lib/codemirror/asciidoc-fold.ts`.
- [X] T067 [P] [US6] Write tests in `apps/web/tests/components/editor/editor-toolbar.test.tsx` (extend T024) for keyboard accessibility: all toolbar groups reachable by `Tab`; overflow "More…" button opens dropdown on `Enter`; dropdown items navigable by arrow keys; `Escape` closes dropdown. Fix any issues in `apps/web/src/components/editor/editor-toolbar.tsx`.
- [X] T068 [P] [US6] Keyboard accessibility audit across all editor chrome: write tests in `apps/web/tests/components/editor/editor-accessibility.test.tsx` verifying (1) find panel reachable by shortcut and `Escape`-dismissible; (2) section outline items focusable by `Tab` and activatable by `Enter`; (3) settings panel reachable by keyboard from toolbar/status bar, all controls operable; (4) focus order follows top-to-bottom logical reading order through chrome. Fix any issues in the respective component files.
- [X] T069 [P] [US6] ARIA labels audit: review all `apps/web/src/components/editor/` files; add `aria-label` to any interactive element that lacks visible text (icon-only buttons, collapsible panels, close buttons); verify with automated axe-core assertions in `apps/web/tests/components/editor/editor-accessibility.test.tsx`.
- [X] T070 [US6] Define high-contrast theme CSS: add `.editor-high-contrast` CSS class and overrides in `apps/web/src/app/globals.css` (or a dedicated `apps/web/src/components/editor/editor-themes.css`); ensure all FR-ED-002 token colours meet WCAG AA contrast ratio (≥ 4.5:1) against the high-contrast background; verify by running an automated contrast check in `apps/web/tests/lib/codemirror/asciidoc-highlight.test.ts`.
- [X] T071 [US6] Write E2E tests in `apps/web/tests/e2e/editor/editor.spec.ts` (Playwright): (1) open project → select `.adoc` file → verify CM6 editor present and syntax-highlight classes on heading tokens; (2) type content → wait 5 s → refresh → verify content persists; (3) open find panel via shortcut → enter search term → verify match count → replace all → verify document updated; (4) open section outline → click third heading → verify editor scroll position; (5) open settings panel → increase font size → verify `--editor-font-size` CSS property changed; (6) switch to viewer role → open same file → attempt to type → verify editor content unchanged; (7) Ctrl+click an `include::` path → verify file tree selection changes and editor loads target file; (8) go offline (DevTools Network: Offline) → type content → verify draft stored in localStorage → go online → verify PUT is called and localStorage draft cleared.

**Checkpoint**: All E2E tests green. All accessibility tests pass. Folding works for every block type. High-contrast theme meets WCAG AA.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final quality gate and any cleanup discovered during implementation.

- [X] T073 Run full quality gate from repo root: `pnpm --filter @asciidocollab/domain test`, `pnpm --filter @asciidocollab/infrastructure test`, `pnpm --filter @asciidocollab/web test`, `pnpm --filter @asciidocollab/web typecheck`, `pnpm --filter @asciidocollab/web lint`; resolve any failures.
- [X] T074 [P] Verify `packages/domain/src/index.ts` and `packages/shared/src/index.ts` export all public types introduced in this feature; remove any unused re-exports or dead code found during the quality gate.
- [X] T075 [P] Update `specs/014-codemirror-editor/quickstart.md` with any deviations discovered during implementation (exact package versions pinned, grammar build command changes, env var naming, etc.).

---

## Dependencies & Execution Order

### Milestone → Phase Mapping

| plan.md Milestone | Phases | Tasks |
|-------------------|--------|-------|
| M1 — Grammar & Syntax Highlighting | 1–3 | T001–T013 |
| M2 — Auto-Save & Save State | 4 | T014–T019 |
| M3 — Find & Replace | 5 | T020–T021 |
| M4 — Editor Chrome (Toolbar, Status Bar, Minimap, Prefs) | 6–8 | T022–T059 |
| M5 — Language Features, Outline, Completions & Navigation | 9 | T060–T078 |
| M6 — Accessibility, Multi-Cursor, Code Folding & E2E | 10–11 | T066–T075 |

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately. T002, T003, T004 can all run in parallel.
- **Phase 2 (Grammar)**: Depends on Phase 1. T007 depends on T006; T008 and T009 can run in parallel after T007.
- **Phase 3 (US1)**: Depends on Phase 2 — grammar must be compiled. T012 and T013 can run after T011.
- **Phase 4 (US2)**: Depends on Phase 3 — editor component must exist. T015 and T016 can run in parallel.
- **Phase 5 (US4)**: Depends on Phase 3 only — can start in parallel with Phase 4 once US1 is done.
- **Phase 6 (US5)**: Depends on Phase 3 — toolbar wraps CM6 commands, needs the editor. T023 can start before T025.
- **Phase 7 (US3)**: Depends on Phase 2 — outline walks Lezer parse tree. T028, T030 can run in parallel.
- **Phase 8 (US7)**: Domain tasks (T034–T046) depend on Phase 1 only and can run in parallel with Phases 3–7. Infrastructure (T047–T050) depends on T046. API (T051–T053) depends on T050. Frontend (T054–T059) depends on T053.
- **Phase 9 (US8 + US9)**: Depends on Phase 2 (grammar for xref/attribute parsing and link-node resolution) and Phase 3 (editor component). T061, T063, and T076 can run in parallel; T077 and T078 follow T076.
- **Phase 10 (US6)**: Depends on all previous phases being complete. T066–T069 can run in parallel.
- **Phase 11 (Polish)**: Depends on Phase 10 completion.

### User Story Dependencies

| Story | Priority | Blocks | Depends on |
|-------|----------|--------|------------|
| US1 – Syntax Highlighting | P1 | All others | Phase 2 (grammar) |
| US2 – Auto-Save | P1 | — | US1 |
| US4 – Find & Replace | P2 | — | US1 |
| US5 – Toolbar | P2 | — | US1 |
| US3 – Section Outline | P2 | — | Phase 2 (grammar), US1 |
| US9 – Ctrl+Click Navigation | P2 | — | Phase 2 (grammar), US1 |
| US7 – Preferences | P3 | — | US1 (frontend); domain is independent |
| US8 – Auto-Completion | P3 | — | Phase 2 (grammar), US1 |
| US6 – Productivity & A11y | P3 | — | All P1+P2 stories |

### Within Each Phase

- Tests (RED) → Implementation (GREEN) → Refactor
- Value objects before entities; entities before use cases; use cases before routes
- Infrastructure tests require testcontainers — ensure Docker is running

---

## Parallel Execution Examples

### Phase 1 — All in Parallel

```
Task: T002 "Add grammar prebuild script to apps/web/package.json"
Task: T003 "Create constants.ts with AUTOSAVE_DEBOUNCE_MS..."
Task: T004 "Create EditorPreferencesDto in packages/shared/..."
```

### Phase 2 — Grammar Build Chain

```
Sequential: T005 (tests) → T006 (grammar impl) → T007 (compile)
Then parallel: T008 (language.ts) + T009 (highlight.ts + fold.ts)
```

### Phase 4 (US2) — Backend and Frontend in Parallel

```
After T014 (tests written):
Task: T015 "Implement useAutoSave hook in apps/web/src/hooks/use-auto-save.ts"
Task: T016 "Add ETag header to GET content route in apps/api/src/routes/projects/file-content.ts"
```

### Phase 8 (US7) — Value Objects in Parallel

```
After phase setup:
Task: T034 "Write tests for EditorPreferencesId value object"
Task: T035 "Write tests for EditorTheme value object"
Task: T038 "Write tests for EditorPreferences entity"
(then implement T036, T037, T039 in parallel)
```

### Phase 8 (US7) — Use Case Tests in Parallel

```
Task: T042 "Write tests for GetEditorPreferencesUseCase"
Task: T043 "Write tests for SaveEditorPreferencesUseCase"
(then implement T044, T045 in parallel)
```

---

## Implementation Strategy

### MVP First (US1 + US2 only — Phases 1–4)

1. Phase 1: Setup
2. Phase 2: Grammar (CRITICAL — blocks everything)
3. Phase 3: US1 — syntax highlighting + editor component
4. Phase 4: US2 — auto-save + status bar
5. **STOP and VALIDATE**: File opens with highlighting, edits auto-save, save state indicator works.
6. Demo/deploy if ready.

### Incremental Delivery

| Increment | Phases | What Ships |
|-----------|--------|------------|
| MVP | 1–4 | Highlighted editor, auto-save, save indicator |
| + Find & Replace | + 5 | Search/replace with regex |
| + Toolbar | + 6 | Formatting toolbar |
| + Section Outline | + 7 | Heading navigation |
| + Preferences | + 8 | Persistent font size + theme + minimap |
| + Completions & Navigation | + 9 | Attribute / path / xref auto-complete; Ctrl+click file/URL navigation |
| + Full Polish | + 10–11 | A11y, E2E, offline save, draft recovery |

### Parallel Team Strategy

With two developers:

- **Developer A**: Phases 1 → 2 → 3 → 4 → 5 (grammar + editor + auto-save + find/replace)
- **Developer B**: Phases 8 domain stack (T034–T046) while Developer A works Phases 1–3; then Phase 8 infra/API; then Phase 8 frontend once Developer A has delivered the editor component.
- Once both merge: Phase 10 (accessibility + E2E) can be split by component.

---

## Notes

- `[P]` tasks touch different files with no shared in-progress dependencies — safe to run in parallel within the same phase.
- Grammar compilation (T006 → T007) is sequential: the `.grammar` file must be complete before `lezer-generator` produces a usable parser.
- Never run `prisma migrate` without explicit user confirmation (Architecture Constitution — Database Migration Policy).
- All test paths use `tests/` root — never `__tests__/` or co-located with source.
- Run `pnpm --filter @asciidocollab/web lint` and `typecheck` after each phase to catch issues early.
