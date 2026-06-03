# Feature Specification: Project Page Editor

**Feature Branch**: `012-project-page-editor`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "create the project page with the file tree on the left, placeholders to view the content of the files and preview using Asciidoctor.js (collapsible), must also have links to project settings/members, create e2e tests for the file management"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Browse Project File Tree (Priority: P1)

A project member opens a project and immediately sees its full file and folder hierarchy in a left-side panel. They can expand and collapse folders, and understand the project structure at a glance. Clicking a file selects it and loads its content in the main area.

**Why this priority**: The file tree is the primary navigation mechanism for the entire project page. Without it, no other feature on the page is reachable. It is the foundation all subsequent stories depend on.

**Independent Test**: A user can navigate to a project, see the file tree, expand a folder, and click a file to select it — all without needing the preview or editor panels.

**Acceptance Scenarios**:

1. **Given** a project with files and folders, **When** the user navigates to the project page, **Then** the file tree is visible in the left panel and reflects the current project structure.
2. **Given** a collapsed folder in the tree, **When** the user clicks the folder, **Then** its children are revealed inline.
3. **Given** a file in the tree, **When** the user clicks the file, **Then** the file becomes the active selection and its content area is shown in the main panel.
4. **Given** an empty project (no files), **When** the user opens the project page, **Then** a clear empty-state message with a prompt to create the first file is displayed.

---

### User Story 2 — View File Content (Priority: P2)

A project member selects a file in the tree and sees its raw content displayed in the main content area. The view is read-only and clearly distinguishes the content of the file from the surrounding page chrome.

**Why this priority**: Viewing file content is the core value proposition of opening a project. Even without editing or preview capabilities, users can inspect their documents.

**Independent Test**: A user selects a file from the tree and reads its raw textual content in the main panel. No editing or rendering is required for this story to deliver value.

**Acceptance Scenarios**:

1. **Given** a selected file with content, **When** the main panel renders, **Then** the raw file content is displayed as plain text.
2. **Given** a binary file (image, PDF), **When** the user selects it, **Then** a "preview not available" placeholder is shown rather than garbled content.
3. **Given** a very large file, **When** the user selects it, **Then** content loads without blocking the UI (may be paginated or truncated with a notice).
4. **Given** no file is selected, **When** the user views the project page, **Then** a placeholder message prompts them to select a file from the tree.

---

### User Story 3 — AsciiDoc Preview Panel (Priority: P3)

A user viewing an AsciiDoc file can open a collapsible preview panel that renders the document as formatted HTML using Asciidoctor.js in the browser. The panel can be toggled open or closed without losing the raw content view.

**Why this priority**: Preview is the primary differentiator of AsciiDoCollab over generic file storage. It delivers the core value of the product but requires the file tree and content view to already work.

**Independent Test**: A user opens an `.adoc` file, toggles the preview panel open, sees rendered output, then collapses it — all within the project page without any server roundtrip for rendering.

**Acceptance Scenarios**:

1. **Given** an AsciiDoc file is selected, **When** the user opens the preview panel, **Then** the file content is rendered as formatted HTML with headings, lists, code blocks, and other AsciiDoc elements resolved.
2. **Given** the preview panel is open, **When** the user collapses it, **Then** the panel hides and the content area expands to fill the available space.
3. **Given** a non-AsciiDoc file is selected (e.g., `.txt`, `.json`), **When** the preview panel is available, **Then** it either shows a "preview not available for this file type" message or the toggle is disabled.
4. **Given** a file with AsciiDoc include directives or cross-references, **When** rendered, **Then** unresolvable references degrade gracefully rather than crashing the preview.

---

### User Story 4 — File Management Operations (Priority: P2)

Project owners can create new files and folders, rename existing items, and delete them directly from the file tree. These operations are reflected immediately in the tree without a full page reload.

**Why this priority**: File management (create, rename, delete) is essential for any project page to be useful as a working environment. It is rated P2 alongside content viewing since both are needed for a productive session.

**Independent Test**: A project owner creates a new file, renames it, then deletes it — all visible in the file tree in real time. This story can be tested independently of the preview or content view.

**Acceptance Scenarios**:

1. **Given** a project owner, **When** they create a new file or folder via the tree, **Then** the new item appears in the correct location in the tree immediately.
2. **Given** an existing file or folder, **When** the owner renames it, **Then** the tree reflects the new name without a full reload.
3. **Given** an existing item, **When** the owner deletes it, **Then** it is removed from the tree and any open content panel for that file is cleared.
4. **Given** a project viewer (non-owner), **When** they view the tree, **Then** create, rename, and delete controls are not visible or are disabled.
5. **Given** a rename or delete of a non-empty folder, **When** confirmed, **Then** the operation applies to all descendants and the tree updates accordingly.

---

### User Story 5 — Project Navigation Links (Priority: P1)

From the project page, any authenticated member can quickly navigate to the project's Settings and Members pages via visible, persistent links.

**Why this priority**: Navigation continuity is foundational. Users must never feel trapped on a page without a clear path to related project management views.

**Independent Test**: A user can see and use links to Settings and Members from the project page without needing to use the file tree or any other project-page feature.

**Acceptance Scenarios**:

1. **Given** a project owner on the project page, **When** they look at the page header or sidebar, **Then** links to Settings and Members are clearly visible.
2. **Given** a project viewer (non-owner), **When** they view the project page, **Then** a link back to the dashboard is always accessible (Settings and Members links may be hidden for non-owners).
3. **Given** any authenticated user, **When** they follow the Settings or Members link, **Then** they land on the correct page without authentication errors.

---

### User Story 6 — E2E Tests for File Management (Priority: P3)

Automated end-to-end tests cover the file management operations (create, rename, delete files and folders) through the browser, ensuring they work correctly as part of the full application stack.

**Why this priority**: E2E tests protect against regressions in a feature that modifies persistent data. They are lower priority than the features themselves but essential for long-term maintainability.

**Independent Test**: The test suite runs against a live stack (API + database + web app) and validates each file management operation end-to-end.

**Acceptance Scenarios**:

1. **Given** a running application, **When** the E2E suite runs, **Then** all file management tests pass (create file, create folder, rename, delete).
2. **Given** a permission-restricted user, **When** the E2E tests exercise file management, **Then** forbidden operations return appropriate errors and are reflected correctly in the UI.
3. **Given** the test suite, **When** run in CI, **Then** it completes within a reasonable time and produces clear output for any failures.

---

### Edge Cases

- What happens when a file is deleted while it is currently selected and displayed in the content area?
- What happens if the file tree fails to load (API error or network issue)?
- What happens when a user uploads a file with a name that already exists in the same folder?
- How does the preview panel behave if the Asciidoctor.js library fails to load (e.g., network error in an offline environment)?
- What happens when a folder is renamed while a child file from it is selected?
- What happens if the user's session expires while they are on the project page?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project page MUST display a collapsible file tree panel on the left side showing all files and folders in the project hierarchy.
- **FR-002**: The file tree MUST support expand/collapse for folders and single-click selection for files.
- **FR-003**: When a file is selected, the system MUST display its content in the main panel area.
- **FR-004**: The project page MUST include a collapsible AsciiDoc preview panel that renders the selected file's content using Asciidoctor.js client-side.
- **FR-005**: The preview panel MUST only render AsciiDoc content; for other file types it MUST display a "preview not available" message.
- **FR-006**: The preview panel toggle MUST persist its open/closed state for the duration of the browser session.
- **FR-007**: Project owners MUST be able to create new files and folders from the file tree.
- **FR-008**: Project owners MUST be able to rename files and folders from the file tree.
- **FR-009**: Project owners MUST be able to delete files and folders (with confirmation for non-empty folders) from the file tree.
- **FR-010**: File tree updates (create, rename, delete) MUST be reflected immediately without a full page reload.
- **FR-011**: The project page MUST display visible navigation links to the project's Settings and Members pages for owners; a "Back to Dashboard" link MUST be accessible to all members.
- **FR-012**: The content view MUST be read-only; editing file content is out of scope for this feature and will be addressed in a future collaborative editor feature.
- **FR-013**: The file tree MUST receive real-time updates when another session modifies the project's file structure.
- **FR-014**: E2E tests MUST cover: creating a file, creating a folder, renaming a file, renaming a folder, deleting a file, and deleting a folder.
- **FR-015**: E2E tests MUST verify that viewers cannot perform file management operations.

### Key Entities

- **File Node**: A file or folder within a project, with a name, type (file/folder), parent reference, and ordering. Files have associated content stored separately.
- **File Content**: The raw binary or text content of a file node, fetched separately from the file tree metadata.
- **Project**: The container for all file nodes; accessed by project ID from the URL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can navigate from the dashboard to a project and see the file tree within 2 seconds on a standard connection.
- **SC-002**: Selecting a file and seeing its content takes under 1 second for files up to 1 MB.
- **SC-003**: The AsciiDoc preview renders a 500-line document in under 2 seconds after the panel is opened.
- **SC-004**: File management operations (create, rename, delete) complete and are reflected in the tree within 1 second.
- **SC-005**: All E2E file management tests pass consistently in CI with no flaky failures over 5 consecutive runs.
- **SC-006**: Project viewers see no file management controls (zero owner-only affordances visible to non-owners).

## Assumptions

- The existing file tree API endpoints (create, rename, delete, list) are already implemented and stable; this feature only adds the frontend UI to consume them.
- The existing file content API endpoints (read file content) are implemented; the content view calls them directly.
- Asciidoctor.js will be loaded as a client-side dependency; server-side rendering of AsciiDoc is out of scope for this feature.
- The real-time file tree update mechanism (SharedWorker + Server-Sent Events) is already implemented in the codebase and will be wired into the project page.
- The content view is read-only in this version; a collaborative text editor is a separate future feature.
- Mobile layout optimisation is out of scope; the file tree panel is designed for desktop/wide-viewport usage.
- File upload via drag-and-drop or a file picker is out of scope for this feature (file creation refers to creating new empty files).
- E2E tests will use Playwright and target a locally running full stack, consistent with the project's existing E2E test infrastructure.
