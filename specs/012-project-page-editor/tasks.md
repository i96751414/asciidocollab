# Tasks: Project Page Editor

**Input**: Design documents from `/specs/012-project-page-editor/`

**TDD Mode**: ⚠️ ALL implementation is test-driven. For every test task:
1. Write the test exactly as specified
2. Run it and **confirm it fails for the right reason** — an assertion failure about missing behavior, NOT a crash due to unrelated infrastructure
3. A "cannot find module" failure is acceptable as the starting point for a new file
4. Only then write or modify the production code in the paired implementation task

## Architecture Decision (from analysis remediation)

`useFileSelection` is called **in `ProjectEditorLayout`** (not inside `FileContentPanel`). The layout owns all selection and content-fetch state and passes it down as props:

```tsx
// project-editor-layout.tsx
const { selectedFile, contentState, selectFile, clearSelection } = useFileSelection(projectId);

<FileTree onSelectFile={selectFile} selectedNodeId={selectedFile?.nodeId ?? null} isOwner={isOwner} />
<FileContentPanel selectedFile={selectedFile} contentState={contentState} />
<AsciiDocPreview content={contentState.content ?? ''} isOpen={previewOpen} onToggle={togglePreview} />
```

`FileContentPanel` is a **pure display component** — no internal hook call, no fetch.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6 from spec.md)
- Include exact file paths in every task description

## Path Conventions

| App | Source root | Test root |
|-----|-------------|-----------|
| `apps/web` | `apps/web/src/` | `apps/web/tests/` |

E2E tests live in `apps/web/e2e/`. Never use `__tests__/` directories.

---

## Phase 1: Setup

**Purpose**: Install the one new runtime dependency required by this feature.

- [X] T001 Add `asciidoctor` npm package — run `pnpm add asciidoctor` from the `apps/web` directory; confirm `apps/web/package.json` now lists it under `dependencies` (v3.0.4 or later). No `@types` package needed — the package ships its own declarations.

---

## Phase 2: Foundational

**Purpose**: Create the `ProjectEditorLayout` client component shell and wire it into the existing server-side project page. All user stories build on top of this layout.

**⚠️ CRITICAL**: No user story work can begin until Phase 2 is complete.

- [X] T002 Write failing test — `ProjectEditorLayout` shell — in `apps/web/tests/app/(dashboard)/projects/[id]/project-editor-layout.test.tsx`; render `<ProjectEditorLayout projectId="p1" projectName="My Project" projectDescription={null} isOwner={true} />`; assert it renders without crashing and contains elements with `data-testid="file-tree-panel"`, `data-testid="content-panel"`, and `data-testid="preview-panel"`. **Expected failure**: "cannot find module" — the file does not exist yet.

- [X] T003 Create `ProjectEditorLayout` client component skeleton in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` — accepts `{ projectId, projectName, projectDescription, isOwner }` props; renders a `flex` column containing a header row and a `flex` row with three `div` placeholders, each carrying the `data-testid` from T002. Run T002 — it should now pass.

- [X] T004 Update `apps/web/src/app/(dashboard)/dashboard/projects/[id]/page.tsx` — remove the placeholder `<div>The project editor is not yet available.</div>` and render `<ProjectEditorLayout projectId={id} projectName={project.name} projectDescription={project.description ?? null} isOwner={canManage} />`. Verify the page server component still compiles (`pnpm typecheck`).

---

## Phase 3: User Story 1 — Browse Project File Tree (Priority: P1) 🎯 MVP

**Goal**: A project member opens the project page and sees the full file tree in a collapsible left panel, can expand/collapse folders, click a file to select it (highlighted), and sees an empty-state prompt if the project has no files.

**Independent Test**: Navigate to a project → file tree visible; expand folder → children shown; click file → file highlighted; collapse sidebar → file tree hidden, content panel expands.

### Tests for US1 ⚠️ Write tests FIRST and confirm they fail before implementing

- [X] T005 [P] [US1] Write failing tests for extended `FileTree` props — add new cases to `apps/web/tests/components/file-tree/file-tree.test.tsx`: (a) passes `isOwner={false}` and asserts no FileTreeActions buttons are rendered; (b) passes `onSelectFile` spy and clicks a file node, asserts spy called with `(nodeId, nodeName, nodePath)`; (c) passes a tree with zero children and asserts the text "No files yet" is rendered. **Expected failure**: assertions fail because the new props and behaviors don't exist yet.

- [X] T006 [P] [US1] Write failing tests for extended `FileTreeNode` props — add new cases to `apps/web/tests/components/file-tree/file-tree-node.test.tsx`: (a) passes `selectedNodeId` equal to the node's `id` and asserts a highlight CSS class (`bg-accent`) is applied; (b) passes `isOwner={false}` and asserts no action button is rendered. **Expected failure**: prop doesn't exist; highlight class not applied.

- [X] T010 [US1] Write failing test for sidebar panel toggle — add new case to `apps/web/tests/app/(dashboard)/projects/[id]/project-editor-layout.test.tsx`: (a) renders layout and asserts the file-tree panel is initially visible (`data-testid="file-tree-panel"` is in the document and not hidden); (b) clicks the toggle button (`aria-label="collapse sidebar"` or similar); (c) asserts the file-tree panel is hidden (not rendered or has `hidden` class / zero width). **Expected failure**: toggle button not found.

- [X] T025 [US1] Write failing test for FR-013 SSE wiring — add case to `apps/web/tests/app/(dashboard)/projects/[id]/project-editor-layout.test.tsx`: render `ProjectEditorLayout`, mock `useFileTreeEvents` and verify it is called with the correct `projectId`; simulate a `FileTreeEventDto` of type `'created'` and assert the new node's name appears in the rendered tree. **Expected failure**: `useFileTreeEvents` not called with correct args (FileTree not yet wired into layout).

### Implementation for US1

- [X] T007 [P] [US1] Extend `FileTree` in `apps/web/src/components/file-tree/file-tree.tsx` — add `isOwner: boolean`, `onSelectFile: (nodeId: string, nodeName: string, nodePath: string) => void`, and `selectedNodeId: string | null` props; call `onSelectFile` when a file node is clicked; pass `isOwner` and `selectedNodeId` down to each `FileTreeNode`; render the `EmptyState` component (or inline message "No files yet. Create your first file.") when `tree.children` is empty. **In the same commit**: update all 5 existing render calls in `apps/web/tests/components/file-tree/file-tree.test.tsx` (lines 55, 60, 80, 100, 126) to pass `isOwner={false}`, `onSelectFile={jest.fn()}`, and `selectedNodeId={null}` so the suite stays green. Run T005 — all three new cases must pass and all existing cases must remain green.

- [X] T008 [P] [US1] Extend `FileTreeNode` in `apps/web/src/components/file-tree/file-tree-node.tsx` — add `isOwner: boolean` and `selectedNodeId: string | null` props; **update `onSelect` prop signature to `(nodeId: string, nodeName: string, nodePath: string) => void`** and call it as `onSelect(node.id, node.name, node.path)` in `handleClick`; apply `bg-accent` highlight class when `node.id === selectedNodeId`; render `FileTreeActions` only when `isOwner === true`; propagate both new props to recursive child `FileTreeNode` renders. **In the same commit**: update all 5 existing render calls in `apps/web/tests/components/file-tree/file-tree-node.test.tsx` (lines 31, 44, 68, 83, 97) to pass `isOwner={false}`, `selectedNodeId={null}`, and update the `onSelect` prop to match the new 3-argument signature `(nodeId, nodeName, nodePath) => {}`. Run T006 — all new cases must pass and all existing cases must remain green.

- [X] T00X [US1] Wire `FileTree` and `useFileSelection` into `ProjectEditorLayout` in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` — call `useFileSelection(projectId)` at the top of the layout to get `{ selectedFile, contentState, selectFile, clearSelection }`; use `selectFile` as the `onSelectFile` callback for `FileTree`; use `selectedFile?.nodeId ?? null` as `selectedNodeId`; give the left panel `data-testid="file-tree-panel"` a fixed width (`w-64 shrink-0`) with vertical scroll. Run T025 — it should now pass.

- [X] T011 [US1] Implement sidebar panel collapse toggle in `ProjectEditorLayout` in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` — add `sidebarOpen` state (default `true`); render a toggle button with `aria-label="collapse sidebar"` (when open) / `aria-label="expand sidebar"` (when closed) on the edge of the file-tree panel; when `sidebarOpen` is false, hide the file-tree panel (e.g., `hidden` class or `w-0 overflow-hidden`) so the content panel expands to fill available space. Run T010 — all cases must pass.

**Checkpoint**: User Story 1 complete — file tree renders, selection works, sidebar toggle works, empty state shown, real-time SSE updates wired.

---

## Phase 4: User Story 5 — Project Navigation Links (Priority: P1)

**Goal**: From the project page, authenticated members always see a "Back to projects" link; owners additionally see links to Settings and Members.

**Independent Test**: Render layout with `isOwner={true}` → Settings and Members links present. With `isOwner={false}` → only "Back to projects" present.

### Test for US5 ⚠️ Write test FIRST and confirm it fails before implementing

- [X] T012 [US5] Write failing tests for navigation links — add cases to `apps/web/tests/app/(dashboard)/projects/[id]/project-editor-layout.test.tsx`: (a) with `isOwner={true}`, assert links "Settings" (href `/dashboard/projects/p1/settings`) and "Members" (href `/dashboard/projects/p1/members`) are present; (b) with `isOwner={false}`, assert those two links are NOT present; (c) for both roles, assert `<a>` with text "Back to projects" and href `/dashboard` is present. **Expected failure**: links not yet rendered.

### Implementation for US5

- [X] T013 [US5] Add navigation header to `ProjectEditorLayout` in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` — top header row above the three panels: always render `<Link href="/dashboard">← Back to projects</Link>`; when `isOwner` is true, also render `<Link href={/dashboard/projects/${projectId}/settings}>Settings</Link>` and `<Link href={/dashboard/projects/${projectId}/members}>Members</Link>`. Run T012 — all three cases must pass.

**Checkpoint**: User Story 5 complete — navigation links visible per role.

---

## Phase 5: User Story 2 — View File Content (Priority: P2)

**Goal**: Selecting a file displays its raw text content in the main panel. Binary files show a placeholder. No file selected shows a prompt. Loading and error states are handled. `FileContentPanel` is a **pure display component** — content fetching lives in `useFileSelection` at the layout level.

**Independent Test**: Click file → raw text visible within 1 second. No preview or editing required.

### Tests for US2 ⚠️ Write tests FIRST and confirm they fail before implementing

- [X] T014 [P] [US2] Write failing tests for `useFileSelection` hook — in `apps/web/tests/hooks/use-file-selection.test.ts`: (a) calling `selectFile('n1', 'doc.adoc', '/doc.adoc', 'file')` triggers a `fetch` to `GET /projects/p1/files/n1/content`; (b) a `text/plain` response sets `contentState.content` to response text and `isLoading` to `false`; (c) an `image/png` response sets `contentState.isBinary: true` and `content: null`; (d) a network error sets `contentState.error` to the message; (e) calling `selectFile` twice in quick succession aborts the first fetch (verify via `AbortController` signal); (f) `clearSelection()` resets `selectedFile` to `null` and `contentState` to initial values. **Expected failure**: "cannot find module `@/hooks/use-file-selection`".

- [X] T015 [P] [US2] Write failing tests for `FileContentPanel` pure display component — in `apps/web/tests/components/file-content-panel.test.tsx`: (a) with `selectedFile={null}`, renders "Select a file from the tree to view its content"; (b) with `contentState={ isLoading: true, ... }`, renders a loading skeleton; (c) with `contentState={ content: 'Hello', isLoading: false, error: null, isBinary: false }`, renders "Hello" inside a `<pre>` element; (d) with `contentState={ isBinary: true, ... }`, renders "Preview not available for binary files"; (e) with `contentState={ error: 'Network error', ... }`, renders the error message. **Expected failure**: "cannot find module `@/components/file-content-panel`".

### Implementation for US2

- [X] T016 [US2] Implement `useFileSelection` hook in `apps/web/src/hooks/use-file-selection.ts` — signature: `function useFileSelection(projectId: string): { selectedFile: SelectedFile | null; contentState: FileContentState; selectFile: (...) => void; clearSelection: () => void }`; uses `AbortController` for in-flight cancellation; inspects `Content-Type` header to set `isBinary`; reads text body only for `text/*` types. Run T014 — all six cases must pass.

- [X] T017 [US2] Implement `FileContentPanel` pure display component in `apps/web/src/components/file-content-panel.tsx` — props: `{ selectedFile: SelectedFile | null; contentState: FileContentState }` (no `projectId`, no internal hook call); renders the five visual states from T015 (`<pre>` for text, shadcn `Skeleton` for loading, typed placeholder strings for null/binary/error). Run T015 — all five cases must pass.

- [X] T018 [US2] Wire `FileContentPanel` into `ProjectEditorLayout` in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` — pass `selectedFile` and `contentState` from the `useFileSelection` hook (already called in T009) to `FileContentPanel`; render in the `data-testid="content-panel"` flex-1 area. Verify T002, T012 tests remain green.

**Checkpoint**: User Story 2 complete — file content visible on selection, all states handled.

---

## Phase 6: User Story 4 — File Management Operations (Priority: P2)

**Goal**: Project owners can create, rename, and delete files/folders via proper Dialog UI. Non-empty folder deletion shows a distinct warning. Changes appear instantly via existing SSE updates.

**Independent Test**: As owner: create a file → appears in tree. Rename it → new name shown. Delete it → removed. As viewer: no create/rename/delete controls visible.

### Tests for US4 ⚠️ Write tests FIRST and confirm they fail before implementing

- [X] T019 [US4] Write failing test for rename Dialog — add case to `apps/web/tests/components/file-tree/file-tree-actions.test.tsx`: clicking "Rename" opens a Dialog containing an `<input>` pre-filled with `nodeName`; typing a new name and clicking Confirm calls `renameFileNode` with the new value; `window.prompt` is NOT called (spy it and assert never called). **Expected failure**: `window.prompt` IS called — old behavior triggers before the Dialog is added.

- [X] T020 [US4] Write failing tests for delete ConfirmationDialog — add two cases to `apps/web/tests/components/file-tree/file-tree-actions.test.tsx`: (a) deleting a **file or empty folder**: `ConfirmationDialog` appears with message "Delete {nodeName}?"; confirming calls `deleteFileNode`; (b) deleting a **non-empty folder** (pass `nodeType="folder"` and `hasChildren={true}` prop): dialog body includes a distinct warning "This will also delete all files inside". **Expected failure**: delete fires immediately without a dialog; no `hasChildren` prop exists yet.

- [X] T021 [US4] Write failing test for create file/folder Dialog — add case to `apps/web/tests/components/file-tree/file-tree-actions.test.tsx`: clicking "New File" opens a Dialog with an `<input>` defaulted to `"new-document.adoc"`; confirming calls `createFileNode` with the entered name. Same for "New Folder" with `createFolder`. **Expected failure**: `createFileNode` called immediately with hardcoded name, no Dialog rendered.

### Implementation for US4

- [X] T022 [US4] Replace `window.prompt()` rename in `FileTreeActions` (`apps/web/src/components/file-tree/file-tree-actions.tsx`) — add `DialogKind` state; on "Rename" select, set state to `{ type: 'rename', currentName: nodeName }`; render a Radix UI Dialog with a controlled `<Input>` pre-filled with `currentName`; confirm calls `renameFileNode(projectId, fileNodeId, newName)`; cancel resets state. **Also in this task**: remove the "Move" `DropdownMenuItem` entirely (lines 55–69 in the current file) — Move is out of scope for this feature and its `globalThis.prompt()` call would be the only remaining `window.prompt` after this phase. Run T019 — must pass.

- [X] T023 [US4] Implement delete ConfirmationDialog in `FileTreeActions` — add `hasChildren: boolean` prop to `FileTreeActions`; on "Delete" select, open `ConfirmationDialog` with message "Delete {nodeName}?" and, when `hasChildren` is true, add body text "This will also delete all files inside."; confirm calls `deleteFileNode`; cancel closes dialog. **In the same commit**: update both existing render calls in `apps/web/tests/components/file-tree/file-tree-actions.test.tsx` (lines 34 and 56) to pass `hasChildren={false}` so the suite stays green. Run T020 — both new cases must pass and all existing cases must remain green.

- [X] T024 [US4] Implement create file/folder Dialog in `FileTreeActions` — on "New File" / "New Folder" select, open a Radix UI Dialog with an `<Input>` (default `"new-document.adoc"` / `"New Folder"`); confirm calls `createFileNode` / `createFolder` with entered name. Run T021 — must pass.

**Checkpoint**: User Story 4 complete — file management via proper dialogs, non-empty folder warning, viewer sees no controls.

---

## Phase 7: User Story 3 — AsciiDoc Preview Panel (Priority: P3)

**Goal**: For AsciiDoc files, a collapsible right panel renders the document using Asciidoctor.js client-side. Non-AsciiDoc files show "preview not available". Panel state persists for the browser session. `AsciiDocPreview` receives raw content as a prop from the layout (which owns `contentState`).

**Independent Test**: Open an `.adoc` file → toggle preview open → formatted HTML rendered. Collapse → panel hides. Non-`.adoc` file → "Preview not available" shown. Reload tab → panel stays in same state.

### Tests for US3 ⚠️ Write tests FIRST and confirm they fail before implementing

- [X] T027 [P] [US3] Write failing tests for `AsciiDocPreview` — in `apps/web/tests/components/asciidoc-preview.test.tsx`: (a) with `isOpen={false}`, only toggle button rendered; (b) clicking toggle calls `onToggle`; (c) with `isOpen={true}` and mocked `import('asciidoctor')` returning a processor whose `convert()` returns `"<p>Hello</p>"`, the HTML appears in the component. **Expected failure**: "cannot find module `@/components/asciidoc-preview`".

- [X] T028 [US3] Write failing tests for `isAsciiDocFile` helper — in the same `apps/web/tests/components/asciidoc-preview.test.tsx` file (runs after T027, same file): assert `.adoc` → `true`, `.asciidoc` → `true`, `.asc` → `true`, `.ADOC` → `true` (case-insensitive), `.txt` → `false`, `.json` → `false`, no-extension → `false`. **Expected failure**: "cannot find module" or named export not found. (Not parallel with T027 — both write to the same file; run T027 first then append T028's test cases.)

### Implementation for US3

- [X] T029 [US3] Implement `isAsciiDocFile` and `AsciiDocPreview` client component in `apps/web/src/components/asciidoc-preview.tsx` — **Requires T001 complete** (`asciidoctor` must be in `package.json` before this task runs). Props: `{ content: string; isOpen: boolean; onToggle: () => void }`; `useEffect` with dynamic `import('asciidoctor')`, `processor.convert(content, { safe: 'safe' })`, cancellation flag; renders toggle button, loading state, and `dangerouslySetInnerHTML` when open. Run T027 and T028 — all cases must pass.

- [X] T030 [US3] Wire `AsciiDocPreview` into `ProjectEditorLayout` in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/project-editor-layout.tsx` — add `previewOpen` state, initialised from `sessionStorage.getItem('asciidoc-preview-open') === 'true'` inside `useEffect`, written back on every toggle; render `AsciiDocPreview` in `data-testid="preview-panel"` with `content={contentState.content ?? ''}`, `isOpen={previewOpen}`, `onToggle={togglePreview}`; the panel should only appear when `selectedFile !== null && isAsciiDocFile(selectedFile.nodeName)` — otherwise render "Preview not available for this file type" in a collapsed strip. Verify T002, T012 tests remain green.

**Checkpoint**: User Story 3 complete — AsciiDoc preview toggles, persists, and renders correctly.

---

## Phase 8: User Story 6 — E2E Tests for File Management (Priority: P3)

**Goal**: A Playwright E2E suite covers all file management operations and verifies viewer permission enforcement.

**Independent Test**: `pnpm exec playwright test e2e/project-file-management.spec.ts` passes against a running full stack.

### E2E Tests for US6 ⚠️ Write each test and confirm it fails before wiring is complete

- [X] T031 [US6] Add file management and viewer E2E helpers to `apps/web/e2e/helpers/test-project.ts` — implement `createTestFile(page, projectId, parentId, name)`, `createTestFolder(page, projectId, parentId, name)`, `deleteTestFileNode(page, projectId, fileNodeId)` that call the API directly (like the existing `createProject` helper); also implement `createViewerInProject(page, projectId)` that invites a pre-seeded second test user as a viewer via the API and returns the viewer's credentials. (Note: use `createTestFile` / `createTestFolder` to avoid name clash with the `createFileNode` API client in `apps/web/src/lib/api/file-tree.ts`.)

- [X] T032 [US6] Write + verify failing E2E test — "owner can create a new file" — in `apps/web/e2e/project-file-management.spec.ts`; sign in as owner, create project, navigate to project page, click "New File" button in tree, type a name in the dialog `<input>`, click Confirm, assert the new file name appears in the tree. Run test — **confirm failure is because the dialog UI is not yet wired**, not because of auth or navigation issues.

- [X] T033 [US6] Write + verify failing E2E test — "owner can create a new folder" — same spec file; click "New Folder", enter name, confirm, assert folder appears in tree. Confirm failure for same reason as T032.

- [X] T034 [US6] Write + verify failing E2E test — "owner can rename a file" — create file via `createTestFile` helper, navigate to project, click rename action on file node, verify Dialog opens with current name pre-filled, type new name, confirm, assert new name visible in tree. Confirm failure.

- [X] T035 [US6] Write + verify failing E2E test — "owner can rename a folder" — same pattern as T034 for a folder node. Confirm failure.

- [X] T036 [US6] Write + verify failing E2E test — "owner can delete a file" — create file via `createTestFile`, navigate, click delete, confirm in ConfirmationDialog, assert file not in tree. Confirm failure.

- [X] T037 [US6] Write + verify failing E2E test — "owner can delete a non-empty folder" — create folder + file inside it via helpers, delete the folder, assert ConfirmationDialog contains the "also delete all files inside" warning text, confirm, assert folder and child are gone. Confirm failure.

- [X] T038 [US6] Write + verify failing E2E test — "viewer cannot see file management controls" — use `createViewerInProject` helper to set up a viewer account; sign in as viewer, navigate to project, assert no "New File", "New Folder", "Rename", or "Delete" buttons are visible in the tree. Confirm failure (controls visible because isOwner not yet gated from E2E perspective).

**Checkpoint**: E2E suite written; each test confirmed to fail for the correct feature-absence reason.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Ensure the full suite is green, types are clean, and CI is reliable.

- [X] T039 Configure Playwright retries for CI in `apps/web/playwright.config.ts` — set `retries: 2` in the CI environment (`process.env.CI ? 2 : 0`); confirm all E2E teardown in `project-file-management.spec.ts` uses `cleanupProject` API helper (not UI-only cleanup) to prevent cross-test contamination.

- [X] T040 Fix regressions in existing tests — run `pnpm test` in `apps/web`; identify tests that now fail because `FileTree`, `FileTreeNode`, or `ProjectEditorLayout` gained new required props; update test fixtures to supply sensible defaults (`isOwner={false}`, `onSelectFile={jest.fn()}`, `selectedNodeId={null}`, `contentState={initial}`, `hasChildren={false}`). Also verify the "isOwner=false hides actions" behavior in `FileTreeActions` tests still passes after the dialog additions.

- [X] T041 [P] Run `pnpm lint` from repo root — fix any ESLint violations in all modified or created files. Zero warnings required.

- [X] T042 [P] Run `pnpm typecheck` from repo root — fix any TypeScript errors across all modified files; ensure no `any` or `as` casts were introduced. Zero errors required.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 for asciidoctor types; T002–T004 can run in parallel with T001
- **US1 (Phase 3)**: Depends on Phase 2; T009 must complete before US2/US3 (hook lives in layout)
- **US5 (Phase 4)**: Depends on Phase 2; coordinate with US1 (same layout file — run US5 after T009/T011)
- **US2 (Phase 5)**: Depends on T009 (layout already calls `useFileSelection`; T016 is just the hook file)
- **US4 (Phase 6)**: Depends on T008 (FileTreeNode with isOwner and hasChildren)
- **US3 (Phase 7)**: Depends on T009 (layout owns contentState passed to AsciiDocPreview) + T001 (asciidoctor installed)
- **US6 (Phase 8)**: Depends on US4 Phase 6 completion (E2E exercises the dialog UI)
- **Polish (Phase 9)**: Depends on all prior phases

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational
- **US5 (P1)**: Depends only on Foundational; coordinate with US1 (same file)
- **US2 (P2)**: Depends on T009 (layout hook wiring)
- **US4 (P2)**: Depends on T007+T008 (FileTree/FileTreeNode extension)
- **US3 (P3)**: Depends on T009 (layout owns contentState) + T001
- **US6 (P3)**: Depends on US4 (Phase 6) completion

### Within Each User Story

- Test tasks MUST be written and confirmed failing before paired implementation tasks begin
- Test failures MUST describe the missing behavior (not unrelated infrastructure crashes)
- Implement → run tests → green → commit

### Parallel Opportunities

- T005 + T006 (US1 tests): parallel — different files
- T007 + T008 (US1 impl): parallel — different files
- T014 + T015 (US2 tests): parallel — different new files
- T027 then T028 (US3 tests): sequential — both write to the same test file; T027 runs first, T028 appends
- T041 + T042 (Polish): parallel — different tools

---

## Parallel Execution Examples

### Phase 3: US1

```bash
# In parallel (different files):
Task T005: "Write failing tests for extended FileTree props in apps/web/tests/components/file-tree/file-tree.test.tsx"
Task T006: "Write failing tests for extended FileTreeNode props in apps/web/tests/components/file-tree/file-tree-node.test.tsx"

# After T005 and T006 confirm failing — in parallel (different files):
Task T007: "Extend FileTree in apps/web/src/components/file-tree/file-tree.tsx"
Task T008: "Extend FileTreeNode in apps/web/src/components/file-tree/file-tree-node.tsx"
```

### Phase 5: US2

```bash
# In parallel (different new files):
Task T014: "Write failing tests for useFileSelection in apps/web/tests/hooks/use-file-selection.test.ts"
Task T015: "Write failing tests for FileContentPanel in apps/web/tests/components/file-content-panel.test.tsx"
```

---

## Implementation Strategy

### MVP First (US1 + US5 — browsing + navigation)

1. Phase 1: Install asciidoctor
2. Phase 2: Foundational layout shell
3. Phase 3: US1 (file tree + sidebar toggle + SSE)
4. Phase 4: US5 (navigation links)
5. **STOP and VALIDATE**: File tree browsable, sidebar toggles, navigation links work
6. Demo/review if ready

### Incremental Delivery

1. Setup + Foundational → layout renders
2. US1 + US5 (P1) → browsing MVP
3. US2 (P2) → file content viewable
4. US4 (P2) → file management with proper dialogs
5. US3 (P3) → AsciiDoc preview
6. US6 (P3) → E2E regression protection in CI
7. Polish → clean slate

---

## TDD Verification Checklist

Before moving from any test task to its paired implementation task, verify:

- [ ] Test file exists at the specified path
- [ ] `pnpm test [path]` runs without crashing (import errors are acceptable)
- [ ] The failure message describes the missing behavior (e.g., "Expected spy to have been called")
- [ ] The failure is NOT caused by unrelated code (e.g., a missing mock for a different dependency)
- [ ] For E2E tests (T032–T038): `pnpm exec playwright test [spec] -g "[test name]"` fails because the UI action doesn't exist, not because of auth or navigation failures

---

## Notes

- [P] tasks = different files, no incomplete-task dependencies
- [Story] label maps to user stories: US1–US6 from spec.md
- E2E helper names: `createTestFile` / `createTestFolder` (not `createFileNode`) to avoid naming conflict with `apps/web/src/lib/api/file-tree.ts`
- Each user story is independently completable and testable
- Commit after each green phase (test + implementation together)
- Stop at each Checkpoint to validate the story independently
