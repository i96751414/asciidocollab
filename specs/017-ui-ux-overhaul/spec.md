# Feature Specification: UI/UX Overhaul — Editor Options, Downloads, Dark Mode & User Menu

**Feature Branch**: `017-ui-ux-overhaul`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "1 - add a new option to the editor for line softwrap (option must be placed next to font size and theme), the default is softwrap to be enabled. 2 - add option to download the entire project as zip or download the selected file (context menu next to rename and delete), allow tree items to be dragged to a different folder with confirmation. 3 - add tailwind dark mode for the entire website, detect browser preference, user can override and preference is stored in a cookie. 4 - replace Account/Sign Out/username with a user button (username + configurable avatar from preset set) with a dropdown for account, settings, admin settings (admin only), audit log (admin only), GitHub link, and log out. Remove leftmost panel."

---

## Clarifications

### Session 2026-06-07

- Q: What is the required approach for ZIP archive generation on the server? → A: ZIP creation MUST be done using streaming — no intermediate ZIP file written to server storage, AND no file content loaded into server memory. Each file MUST be read as a stream and piped directly into the outgoing ZIP stream so that, at any moment, only the bytes currently in-flight for a single file occupy memory.
- Q: Where should theme and soft-wrap preferences be stored? → A: In the database per user, exactly like all other user preferences (font size, editor theme, scroll sync). A browser cookie may be used as a fast read-through cache to prevent flash-of-wrong-theme on page load, but the database value is the canonical store for authenticated users and persists across all browsers and devices.
- Q: What happens when a drag-and-drop move would cause a name conflict at the destination? → A: The confirmation dialog surfaces the conflict and gives the user two choices: cancel the move, or proceed with the moved item automatically renamed (e.g., append a numeric suffix such as " (1)").
- Q: How should the action type filter on the Audit Log page be presented? → A: A dropdown populated dynamically from the database — the list of action types reflects distinct values actually recorded, requiring no hardcoded maintenance.
- Q: How does a user access the avatar picker? → A: Avatar selection is part of the Display Name settings form — the avatar picker is an additional field on the same page, not a separate entry point.
- Q: What should the downloaded ZIP file be named? → A: Project name + date (e.g., `my-project-2026-06-07.zip`).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Dark Mode & Theme Preference (Priority: P1)

A logged-in user visits the application and it automatically renders in the theme that matches their saved account preference. A first-time visitor with no account preference set sees the theme that matches their operating system or browser preference. The chosen theme is saved to the user's account and persists across all browsers and devices.

**Why this priority**: Theme affects every page and component; implementing dark mode first ensures all subsequent UI work (user menu, editor toolbar) is built on a consistent theming foundation.

**Independent Test**: Can be fully tested by logging in, changing the theme via the user menu, logging out, then logging in again from a different browser — the same theme must be applied without any manual action.

**Acceptance Scenarios**:

1. **Given** a logged-in user whose account has no theme preference set and whose OS is in dark mode, **When** they open the application, **Then** the application renders in dark theme.
2. **Given** a logged-in user whose account has no theme preference set and whose OS is in light mode, **When** they open the application, **Then** the application renders in light theme.
3. **Given** a logged-in user changes the theme via "Application Theme" in the user menu dropdown, **When** the change is applied, **Then** the entire application switches immediately and the preference is saved to their account in the database.
4. **Given** a logged-in user previously saved dark theme to their account, **When** they log in from a different browser or device, **Then** dark theme is applied regardless of that browser's OS preference.
5. **Given** an unauthenticated visitor (e.g., on the login page), **When** they view any page, **Then** the OS/browser preference is used as the default theme (no account to read from).

---

### User Story 2 — User Avatar Menu (Priority: P1)

A logged-in user sees a single button in the header that displays their username alongside a chosen avatar icon. Clicking it opens a dropdown with structured sections for account management, application settings, administrative tools (admin only), an external GitHub link, and log out. The leftmost navigation panel (Projects, Archived, Users) is removed from the layout.

**Why this priority**: The header navigation is the primary entry point for all user actions; consolidating it improves discoverability and frees significant screen space previously occupied by the side panel.

**Independent Test**: Can be fully tested by logging in, clicking the user avatar button, and verifying each dropdown item navigates to or opens the correct destination; admin items can be verified by logging in with an admin account.

**Acceptance Scenarios**:

1. **Given** a logged-in user, **When** they view the header, **Then** they see a button showing their username and a selected avatar icon in place of the previous Account/Sign Out controls and username display.
2. **Given** the user clicks the avatar button, **When** the dropdown opens, **Then** it shows sections in this order: Account (Display Name, Password, Email), Settings (Keyboard Shortcuts, Application Theme), GitHub link, Log Out.
3. **Given** the user is an administrator, **When** the dropdown opens, **Then** an Administrator Settings section (Users, System Settings) and a separate Audit Log item both appear between Settings and GitHub, in this order: Administrator Settings, Audit Log.
4. **Given** a regular (non-admin) user, **When** the dropdown opens, **Then** the Administrator Settings and Audit Log items are not visible.
5. **Given** the user clicks "Display Name", "Password", or "Email" in the Account section, **When** the action completes, **Then** the corresponding account management form opens.
6. **Given** the user clicks the GitHub link, **When** the action completes, **Then** a new browser tab opens pointing to the project's GitHub page.
7. **Given** the user clicks Log Out, **When** the action completes, **Then** their session is terminated and they are redirected to the login page.
8. **Given** the previous leftmost panel existed, **When** the user views any page, **Then** the panel containing Projects, Archived, and Users navigation is no longer present in the layout.

---

### User Story 3 — Configurable User Avatar (Priority: P2)

A logged-in user can select their preferred avatar from a preset collection of avatar icons within the Display Name settings form. The selected avatar is displayed on the user menu button and persisted to their account so it appears consistently across sessions and devices.

**Why this priority**: Avatar personalisation depends on the user menu button (Story 2) existing first; it is a self-contained enhancement that does not block other features.

**Independent Test**: Can be fully tested by opening the Display Name settings form, selecting a different avatar, saving, and verifying the new avatar appears on the header button in the current and a fresh session.

**Acceptance Scenarios**:

1. **Given** a user opens the Display Name settings form (via the Account section of the dropdown), **When** they view the form, **Then** they see a preset avatar picker alongside the display name field, with their current avatar highlighted.
2. **Given** a user selects a different avatar and saves the form, **When** the action completes, **Then** the header user menu button immediately reflects the new avatar.
3. **Given** a user has saved an avatar preference, **When** they log in from another device, **Then** the same avatar is displayed.

---

### User Story 4 — Administrator Audit Log (Priority: P2)

An administrator can navigate to a dedicated Audit Log page that displays a chronological list of recorded system events stored in the database. The page supports pagination and search/filter controls so administrators can efficiently find specific events for compliance and troubleshooting.

**Why this priority**: The Audit Log page is a new page accessible only from the admin dropdown (Story 2); it is independent of other user-facing features.

**Independent Test**: Can be fully tested by logging in as an administrator, clicking Audit Log in the dropdown, verifying the page loads with entries and filtering by user or action type returns a narrowed result set.

**Acceptance Scenarios**:

1. **Given** an administrator clicks the Audit Log button in the dropdown, **When** the page loads, **Then** they see a list of audit log entries showing timestamp, actor (user), action type, and affected resource, ordered from most recent to oldest.
2. **Given** there are many log entries, **When** the user scrolls or navigates pages, **Then** older entries are accessible via pagination.
3. **Given** the administrator enters a date range filter, **When** the filter is applied, **Then** only entries within that date range are shown.
4. **Given** the administrator filters by a specific user, **When** the filter is applied, **Then** only entries attributed to that user are shown.
5. **Given** the administrator filters by action type or category, **When** the filter is applied, **Then** only entries matching that action type are shown.
6. **Given** multiple filters are active simultaneously, **When** results are shown, **Then** entries must satisfy all active filters (AND logic).
7. **Given** a non-administrator user, **When** they attempt to access the Audit Log URL directly, **Then** they are denied access and redirected to an appropriate error or home page.

---

### User Story 5 — Editor Soft Wrap Toggle (Priority: P2)

A user working in the code editor can toggle line soft-wrap on or off using a control placed in the editor toolbar next to the existing font size and theme controls. The default state is soft-wrap enabled. The chosen state persists across sessions.

**Why this priority**: This is an isolated editor setting with no dependencies on other stories in this feature; it improves usability for users editing long lines.

**Independent Test**: Can be fully tested by opening the editor, confirming soft-wrap is on by default, toggling it off and verifying long lines extend past the viewport, then refreshing and confirming the off state persists.

**Acceptance Scenarios**:

1. **Given** a user opens the editor for the first time, **When** they view the toolbar, **Then** a soft-wrap toggle is visible adjacent to the font size and theme controls, and it is in the enabled (on) state.
2. **Given** soft-wrap is enabled, **When** the user views a file with lines longer than the visible editor width, **Then** lines wrap visually within the editor panel without horizontal scrolling.
3. **Given** the user toggles soft-wrap off, **When** they view the same long-line file, **Then** lines extend beyond the panel edge and a horizontal scrollbar appears.
4. **Given** the user has toggled soft-wrap to a non-default state and refreshes the page, **When** the editor reloads, **Then** the previously chosen wrap state is restored.

---

### User Story 6 — Download Project as ZIP (Priority: P3)

A user can download a complete copy of their current project as a ZIP archive by opening the context menu on the root project node in the file tree and selecting "Download as ZIP".

**Why this priority**: Download capability is a useful but non-critical convenience; it has no dependency on other stories and does not block core workflows.

**Independent Test**: Can be fully tested by right-clicking the root project node in the file tree, selecting "Download as ZIP", and verifying the downloaded archive contains all project files in their correct folder structure.

**Acceptance Scenarios**:

1. **Given** a user opens the context menu on the root project node in the file tree, **When** the menu appears, **Then** a "Download as ZIP" option is visible.
2. **Given** the user selects "Download as ZIP", **When** the archive is being prepared, **Then** the user receives visual feedback (e.g., a loading indicator) and the file download begins automatically on completion.
3. **Given** the ZIP is downloaded, **When** it is opened, **Then** the directory structure inside matches the project tree exactly, including all nested folders and files.

---

### User Story 7 — Download Individual File (Priority: P3)

A user can download a single file directly from the file tree by using a context menu option on that file. The option appears alongside the existing Rename and Delete actions.

**Why this priority**: Individual file download is a targeted convenience that builds on the file tree context menu structure already in place.

**Independent Test**: Can be fully tested by right-clicking (or opening the context menu on) any file in the tree, selecting "Download", and verifying the correct file is downloaded to the browser.

**Acceptance Scenarios**:

1. **Given** a user opens the context menu for a file in the tree, **When** the menu appears, **Then** a "Download" option is visible alongside Rename and Delete.
2. **Given** the user clicks "Download" on a file, **When** the action completes, **Then** that specific file is downloaded to the browser with its original filename and content.
3. **Given** the user opens the context menu for a folder (not a file), **When** the menu appears, **Then** the Download file option is not shown for folders (project ZIP download is the folder-level action).

---

### User Story 8 — Drag-and-Drop File Tree Reorganisation (Priority: P3)

A user can drag a file or folder from one location in the project file tree and drop it onto a different folder to move it. Before the move is committed, the application asks for confirmation, showing the source and destination paths.

**Why this priority**: Tree reorganisation via drag-and-drop is a power-user workflow enhancement; it requires the file tree to be stable and is independent of download and menu features.

**Independent Test**: Can be fully tested by dragging a file to a different folder, confirming the dialog, and verifying the file appears in the new location and is absent from the original location.

**Acceptance Scenarios**:

1. **Given** a user starts dragging a file or folder in the tree, **When** they drag over a valid target folder, **Then** the target folder is visually highlighted as a valid drop target.
2. **Given** the user drops a file onto a target folder, **When** the drop completes, **Then** a confirmation dialog appears showing the item name, source path, and destination path.
3. **Given** the confirmation dialog is shown, **When** the user confirms the move, **Then** the item is moved to the destination folder and the tree updates to reflect the new structure.
4. **Given** the confirmation dialog is shown, **When** the user cancels, **Then** the item remains in its original location and no changes are made.
5. **Given** a user attempts to drag a file onto itself or its current parent folder, **When** the drop occurs, **Then** no action is taken and no confirmation dialog is shown.
6. **Given** the destination folder contains an item with the same name, **When** the confirmation dialog appears, **Then** it highlights the name conflict and offers two options: cancel the move, or proceed with the item renamed using a numeric suffix (e.g., "file (1).adoc").
7. **Given** a user drags a folder, **When** they confirm the move, **Then** the folder and all its contents are moved to the new location.

---

### Edge Cases

- What happens when a user clears browser cookies? → The theme reverts to OS/browser preference on next visit; the soft-wrap state also reverts to the default (enabled).
- What happens if a ZIP download is triggered on a very large project? → A loading indicator is shown; the operation completes asynchronously and the file downloads when ready.
- What happens if a file is renamed or deleted while a drag operation is in progress? → The drag operation fails gracefully and the tree refreshes to the current state.
- What happens when a dragged item's name conflicts with an existing item at the destination? → The confirmation dialog surfaces the conflict and offers two options: cancel the move, or proceed with the moved item auto-renamed with a numeric suffix.
- What happens if an admin revokes another user's admin role while they are logged in? → The admin-only items disappear from the dropdown on next page load or session refresh.
- What happens if a file download request references a `fileNodeId` from a different project than `:projectId`? → The server returns `404`; no file content is leaked. The check is enforced in the domain use case, not the route handler.
- What happens if a drag-and-drop move request specifies a `newParentId` from a different project? → The move use case rejects it with a validation error; no cross-project move occurs.
- What happens if the avatar preset images fail to load? → A fallback generic icon or initials-based avatar is displayed.
- What happens when a non-admin user navigates directly to the Audit Log URL or System Settings URL? → They are redirected to an access-denied page or home page.
- What happens when the Audit Log filter returns zero results? → An empty state message is shown informing the administrator that no entries match the current filters.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Dark Mode & Theme

- **FR-001**: The application MUST automatically apply dark or light theme on page load based on the authenticated user's saved account preference. For unauthenticated pages (e.g., login), the OS/browser `prefers-color-scheme` media query is used as the default.
- **FR-002**: The application MUST provide a theme selection control accessible via the "Application Theme" option in the user menu dropdown; there is no separate persistent toggle in the header bar.
- **FR-003**: The user's theme preference MUST be stored in the user's account in the database and MUST be consistent across all browsers and devices. A browser cookie MAY be used as a read-through cache to prevent flash-of-wrong-theme on page load, but the database value is the authoritative store.
- **FR-004**: The dark mode styles MUST apply consistently across all pages and components of the application.

#### User Avatar Menu

- **FR-005**: The application MUST replace the current Account button, username display, and Sign Out button with a single user menu button displaying the username and selected avatar.
- **FR-006**: The user menu button MUST open a dropdown when clicked, containing sections in this order: Account (Display Name, Password, Email), Settings (Keyboard Shortcuts, Application Theme), Administrator Settings (admin only — contains: Users, System Settings), Audit Log (admin only), GitHub link, Log Out.
- **FR-007**: The Administrator Settings section (Users, System Settings) and the Audit Log item MUST be visible only to users with the administrator role.
- **FR-008**: Each account action (Display Name, Password, Email) MUST navigate to or open the appropriate account management form.
- **FR-009**: The GitHub link MUST open the project's GitHub repository in a new browser tab.
- **FR-010**: The Log Out action MUST terminate the user session and redirect to the login page.
- **FR-011**: The leftmost navigation panel containing Projects, Archived, and Users links MUST be removed from all pages.

#### Configurable Avatar

- **FR-012**: The Display Name settings form MUST include a preset avatar picker as an additional field, allowing users to select their avatar alongside their display name.
- **FR-013**: The selected avatar MUST be persisted to the user's account and displayed consistently across sessions and devices.
- **FR-014**: A reasonable default avatar MUST be assigned to users who have not yet selected one.

#### Administrator Audit Log

- **FR-015**: The application MUST provide a new Audit Log page accessible only to administrators.
- **FR-016**: The Audit Log page MUST display audit log entries retrieved from the database, each row showing: timestamp, actor (username), action type, and affected resource. Entries MUST be ordered from most recent to oldest.
- **FR-017**: The Audit Log page MUST support browsing all entries via pagination.
- **FR-018**: The Audit Log page MUST provide filter controls for: date range, actor (user), and action type/category. The action type filter MUST be a dropdown populated dynamically from the database (distinct recorded values only). Multiple active filters MUST be applied together using AND logic.
- **FR-019**: Non-administrator users who attempt to access the Audit Log URL directly MUST be denied access, redirected to `/dashboard`, and the denial MUST be logged with actor, resource, and reason.

#### Editor Soft Wrap

- **FR-020**: The editor toolbar MUST include a soft-wrap toggle control positioned adjacent to the existing font size and theme controls.
- **FR-021**: The default state of the soft-wrap toggle MUST be enabled (wrap on) for all users.
- **FR-022**: When soft-wrap is enabled, lines that exceed the editor panel width MUST wrap visually without horizontal scrolling.
- **FR-023**: When soft-wrap is disabled, long lines MUST extend beyond the panel with a horizontal scrollbar.
- **FR-024**: The user's soft-wrap preference MUST be persisted to the user's account in the database, consistent with how all other editor preferences (font size, editor theme, scroll sync) are stored.

#### File Downloads

- **FR-025**: The file tree context menu on the root project node MUST include a "Download as ZIP" option.
- **FR-026**: The downloaded ZIP MUST be named using the pattern `<project-name>-<YYYY-MM-DD>.zip` (e.g., `my-project-2026-06-07.zip`); the date MUST reflect the server's UTC date at the time of the request.
- **FR-027**: The downloaded ZIP MUST contain all project files and folders in their correct directory hierarchy.
- **FR-028**: The ZIP archive MUST be generated via true streaming: no intermediate ZIP file may be written to server storage, AND no file content may be held in server memory. Each file MUST be read as a byte stream and piped directly into the outgoing ZIP stream; at any moment only the bytes currently in-flight for one file occupy memory.
- **FR-029**: The "Download as ZIP" trigger MUST enter a loading state (e.g., button disabled) immediately on click, giving the user clear feedback that the download has been initiated. The browser-native download progress serves as the primary progress indicator once the stream begins; no server-side preparation phase exists to indicate separately.
- **FR-030**: The file tree context menu for individual files MUST include a "Download" option alongside Rename and Delete.
- **FR-031**: The "Download" file option MUST NOT appear on folder entries (only the root project node exposes "Download as ZIP").

#### Administrator System Settings

- **FR-032**: The application MUST provide a new Administrator System Settings page, accessible only to administrators via the "Administrator Settings" section of the user menu dropdown.
- **FR-033**: The System Settings page MUST allow administrators to configure system-level options (e.g. user registration open/closed, mailer configuration, and other global settings surfaced from existing configuration).
- **FR-034**: Non-administrator users who attempt to access the System Settings URL directly MUST be denied access, redirected to `/dashboard`, and the denial MUST be logged with actor, resource, and reason.

#### Drag-and-Drop Tree Reorganisation

- **FR-035**: Users MUST be able to drag files and folders within the file tree to reorder or move them to a different parent folder.
- **FR-036**: Valid drop targets MUST be visually highlighted during a drag operation.
- **FR-037**: Before completing a move, the application MUST display a confirmation dialog showing the item name, source path, and destination path.
- **FR-038**: If the user cancels the confirmation dialog, the file tree MUST remain unchanged.
- **FR-039**: Dropping an item onto its current parent folder or onto itself MUST be a no-op (no dialog, no change).
- **FR-040**: If the destination folder already contains an item with the same name as the item being moved, the confirmation dialog MUST surface the conflict and offer the user two choices: cancel the move, or proceed with the moved item renamed by appending a numeric suffix (e.g., "document (1).adoc").
- **FR-041**: Moving a folder MUST move all of its contents recursively to the destination.

#### Security & Access Control

- **FR-042**: File download endpoints MUST verify that the requested file node belongs to the specified project; a request for a file node that exists in a different project MUST return `404` (resource not found in this project context).
- **FR-043**: The move (drag-and-drop) API MUST verify that the destination parent folder belongs to the same project as the source item; cross-project moves MUST be rejected with a validation error.
- **FR-044**: The "Download as ZIP" and individual file download endpoints MUST enforce per-IP rate limiting (consistent with the existing API rate-limiting pattern); exceeding the limit MUST return HTTP `429 Too Many Requests`. Indicative production defaults: 10 req/min for ZIP, 30 req/min for individual file downloads.
- **FR-045**: The Audit Log API endpoints MUST enforce per-IP rate limiting to prevent enumeration abuse by admins with compromised credentials. Indicative production default: 120 req/min.

### Key Entities

- **User**: Authenticated account holder with a display name, email, password, role (admin/regular), and avatar preference.
- **AuditLog Entry**: A timestamped system event record stored in the database with actor, action type, affected resource, and metadata.
- **Project**: A collection of files and folders with an owner; supports ZIP export and file-tree manipulation.
- **FileNode**: A node in the project file tree, which can be a file (downloadable, movable, renameable, deleteable) or a folder (movable, renameable, deleteable).
- **UserPreference**: Per-user settings stored in the database (avatar key, display name, application theme, soft-wrap toggle, editor font size, editor theme, scroll sync). A browser cookie (`asciidocollab-theme`) serves as a fast read-through cache for the application theme only, to prevent flash-of-wrong-theme on page load; it does not replace the database as the canonical store.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can switch between light and dark theme in under 2 seconds, with the preference automatically restored on the next visit without any user action.
- **SC-002**: The application correctly applies the OS/browser theme preference on first visit for 100% of users with no cookie stored.
- **SC-003**: Users can access all account, settings, and navigation actions previously spread across multiple controls via a single user menu button click.
- **SC-004**: Administrators can access the Audit Log page, view the most recent entries, and apply any combination of date range, user, and action type filters — all within 3 seconds of page load.
- **SC-005**: Users can toggle soft-wrap in the editor and see the change applied immediately with no perceptible delay.
- **SC-006**: A project ZIP download completes successfully and contains all project files in correct structure; users receive feedback within 1 second of triggering the action.
- **SC-007**: Users can drag and drop a file or folder to a new location and complete the move (including confirmation) in under 30 seconds.
- **SC-008**: The removal of the leftmost panel increases the available editor/content area width without breaking any existing navigation paths.
- **SC-009**: Admin-only features (Administrator Settings, Audit Log) are never visible or accessible to non-administrator users.

---

## Assumptions

- Theme preference and soft-wrap preference are stored in the user's account in the database as the canonical store. A browser cookie is used as a fast read-through cache for theme (to avoid flash-of-wrong-theme on page load) but holds no authority over the database value.
- The project's GitHub repository URL is a known static value that can be hardcoded or configured at build time.
- The existing file tree context menu (Rename, Delete) can be extended to include Download without a full rebuild.
- The audit log data already exists in the database; this feature adds the front-end read-only page to browse it.
- A reasonable set of 8–16 preset avatar icons will be designed or sourced; custom image uploads are out of scope for this feature.
- Drag-and-drop is scoped to within the same project tree; moving files between projects is out of scope.
- Folder-level individual download in the tree is out of scope; only files get the individual download context menu item. Folders use the root-node "Download as ZIP" action.
- The "Application Theme" option in the Settings dropdown is the sole theme control; there is no persistent toggle visible in the header bar.
- The new Administrator System Settings page exposes existing system-level configuration options (registration, mailer, etc.); it does not introduce new configuration capabilities beyond what already exists in the system.
- The action type filter dropdown is populated dynamically from distinct values in the database; no hardcoded list of categories is maintained. No new event types are introduced by this feature.
