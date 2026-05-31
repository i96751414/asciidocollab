# Feature Specification: Project Management Frontend

**Feature Branch**: `009-project-mgmt-frontend`

**Created**: 2026-05-31

**Status**: Draft

**Input**: User description: "add frontend for project management, configuring users and permissions in project, sending invites, deleting projects, archiving projects, updating project settings/configurations, take security into account"

## Clarifications

### Session 2026-05-31

- Q: Can the project owner remove themselves, and what is required to ensure there is always at least one owner? → A: There must be at least one owner at all times. An owner can remove themselves only if at least one other owner exists. When the user is the sole owner, the members page displays a prominent warning and directs them to assign the owner role to another member first. Any current owner can promote another member to owner via the role dropdown.
- Q: What happens when an invited email address does not belong to a registered user? → A: Free-text email entry is not allowed; the invite form uses an autocomplete/search that only surfaces registered users not already in the project. Unregistered addresses are never reachable.
- Q: Can an administrator demote themselves, and what happens if they are the last administrator? → A: Self-demotion is blocked only when the user is the last administrator. The role dropdown disables options below "administrator" for the user's own row in that state, with a tooltip explaining the constraint. When multiple administrators exist, an administrator may freely change their own role.
- Q: When an owner assigns the owner role to another member, do they retain their own owner role? → A: Ownership is shared — the assigning owner retains their role. Multiple owners can coexist. If an owner wishes to fully hand off ownership, they promote another member first, then demote themselves as a separate action.
- Q: What does the settings page look like for an archived project? → A: The settings page renders with all fields disabled (read-only) and a prominent archive banner at the top. Only the restore and delete actions remain active; all other form controls and member management actions are non-interactive.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and access projects from the dashboard (Priority: P1)

A signed-in user lands on the dashboard and sees a list of every project they belong to — with their role clearly shown for each one. Active projects are shown by default; archived ones are tucked into a separate view. From the list they can open a project or jump straight to its settings.

**Why this priority**: The dashboard is the starting point for all project work. Every other story in this spec depends on the user first being able to see and navigate their projects.

**Independent Test**: Can be fully tested by logging in, viewing the dashboard, and verifying that projects are listed with correct names, roles, and status badges. Empty state can be tested against an account with no projects.

**Acceptance Scenarios**:

1. **Given** I am signed in and have projects, **When** I navigate to the dashboard, **Then** I see each project with its name, description snippet, my role, and last-updated date
2. **Given** I have no projects, **When** I view the dashboard, **Then** I see an empty state with a "Create Project" call to action
3. **Given** I have both active and archived projects, **When** I view the dashboard, **Then** only active projects appear by default with an option to reveal archived ones
4. **Given** I am a member of a project with the viewer role, **When** I view the project card, **Then** no settings or management actions are shown for that project
5. **Given** I am an administrator or owner of a project, **When** I view the project card, **Then** a settings link is visible

---

### User Story 2 - Update project settings (Priority: P1)

A project administrator opens the project settings page and updates the project's name, description, or tags. They save the changes and see them reflected immediately without a full page reload.

**Why this priority**: Settings management is the administrative core of this feature. It is needed before member management and other administrative actions can be built on top.

**Independent Test**: Can be fully tested by opening project settings, editing the name, saving, and confirming the update appears in the header and on the dashboard.

**Acceptance Scenarios**:

1. **Given** I am a project administrator, **When** I open the project settings page, **Then** I see a form with the current name, description, and tags pre-filled
2. **Given** I am a project administrator, **When** I submit a valid settings update, **Then** the changes are saved and I see a success notice without leaving the page
3. **Given** I submit an empty name or a name that exceeds the maximum length, **When** the form is submitted, **Then** I see an inline validation error and the form is not submitted
4. **Given** I attempt to use a project name already used by one of my other projects, **When** I save, **Then** I see a clear conflict error and the previous valid name is preserved in the form
5. **Given** I am a viewer or editor, **When** I try to reach the settings URL directly, **Then** I see a "not authorised" screen and no editable fields

---

### User Story 3 - Manage project members (Priority: P2)

A project administrator opens the members section of the project settings page. They can see all current members with their roles, change any member's role, and remove a member — with a confirmation step before removal.

**Why this priority**: Member management is the access control layer. It enables teams to collaborate securely and is closely linked to the invitation flow.

**Independent Test**: Can be fully tested with two accounts: as admin, view the member list, change the second account's role, and remove them. Verify the second account can no longer access the project.

**Acceptance Scenarios**:

1. **Given** I am a project administrator, **When** I open the members tab, **Then** I see a table listing each member's name, email, role, and join date
2. **Given** I am a project administrator, **When** I change a member's role from a dropdown, **Then** the change is saved immediately and a confirmation notice is shown
3. **Given** I am a project administrator, **When** I click "Remove member", **Then** a confirmation dialog appears before the removal is executed
4. **Given** I confirm removal, **When** the server responds with success, **Then** the member disappears from the list without a page reload
5. **Given** I attempt to remove the last remaining owner, **When** the confirmation is submitted, **Then** the action is blocked and I see an explanatory message
6. **Given** I am the only administrator, **When** I try to remove myself, **Then** the action is blocked with a message explaining that at least one administrator must remain
7. **Given** I am the sole owner of a project, **When** I open the members tab, **Then** a prominent warning is displayed stating I cannot leave the project until another member is assigned the owner role

---

### User Story 4 - Invite users to a project (Priority: P2)

A project administrator searches for a colleague by name or email using an autocomplete field. Only registered users who are not already members appear in results. The administrator selects a user, assigns a role, and adds them to the project in one step.

**Why this priority**: Invitations are the primary way teams grow. Without this, member management (Story 3) only allows administrators to manage existing members.

**Independent Test**: Can be tested by opening the invite form, typing part of a registered user's name or email, selecting them from autocomplete results, assigning a role, and confirming the user appears in the members list.

**Acceptance Scenarios**:

1. **Given** I am a project administrator, **When** I type in the invite search field, **Then** I see a dropdown of registered users whose name or email matches my query, excluding users already in the project
2. **Given** I select a user from autocomplete results and choose a role and click "Add Member", **Then** the user is added to the project and appears in the members list immediately
3. **Given** my search query matches no registered users outside the project, **When** results are shown, **Then** I see an empty-results message and no option to proceed
4. **Given** no role is selected when submitting the invite form, **When** the form validates, **Then** I see a validation error prompting me to choose a role
5. **Given** I am a viewer or editor, **When** I try to access the invite form, **Then** the form is not shown and the invite action is not accessible

---

### User Story 5 - Archive and restore a project (Priority: P3)

A project owner can archive a project they are no longer actively using. The project is hidden from the default dashboard view. They can later find it in the archived section and restore it.

**Why this priority**: Archiving keeps the dashboard clean without permanent data loss. It is less critical than settings and member management but important for long-term usability.

**Independent Test**: Can be tested by archiving a project and verifying it disappears from the active list, then using the "Show archived" toggle to find it and restoring it.

**Acceptance Scenarios**:

1. **Given** I am the project owner, **When** I click "Archive project" in settings and confirm, **Then** the project is removed from the active list and appears under archived projects
2. **Given** I archive a project, **When** I (or any member) try to open it directly, **Then** the project is viewable in read-only mode with a banner indicating it is archived
3. **Given** I open the settings page of an archived project, **When** the page loads, **Then** all form fields and member management actions are disabled, a prominent archive banner is shown at the top, and only the restore and delete actions are interactive
4. **Given** I am the project owner viewing an archived project, **When** I click "Restore", **Then** the project reappears in the active list and all settings and member management controls become editable again
5. **Given** I am an administrator (but not owner), **When** I view project settings, **Then** the archive and restore options are not available to me

---

### User Story 6 - Permanently delete a project (Priority: P3)

A project owner chooses to permanently delete a project. After a two-step confirmation that warns them the action is irreversible, the project and all its data are removed and they are returned to the dashboard.

**Why this priority**: Permanent deletion is a destructive, irreversible operation. It is the least frequent action but requires careful handling to prevent accidental data loss.

**Independent Test**: Can be tested by creating a test project, going through the delete confirmation flow, and verifying the project no longer appears anywhere and cannot be accessed by direct URL.

**Acceptance Scenarios**:

1. **Given** I am the project owner, **When** I click "Delete project" in settings, **Then** a confirmation dialog asks me to type the project name before enabling the delete button
2. **Given** I type the project name correctly, **When** I confirm deletion, **Then** the project is deleted, I am redirected to the dashboard, and a notice confirms the deletion
3. **Given** I type the project name incorrectly, **When** I try to confirm deletion, **Then** the delete button remains disabled
4. **Given** I am an administrator (not owner), **When** I view project settings, **Then** the delete option is not present
5. **Given** I delete a project, **When** another signed-in user who was a member tries to access it, **Then** they see a "project not found" page

---

### Edge Cases

- **Concurrent role change**: If two administrators change the same member's role simultaneously, the last saved value wins; the UI refreshes the member list after each save.
- **Session expiry during a destructive action**: If the user's session expires while the delete confirmation dialog is open, submitting the form returns a 401 and the UI redirects to the login page.
- **URL guessing for admin routes**: Navigating directly to a settings URL without the required role returns a 403 page — the page does not expose partial UI elements.
- **Network failure on save**: If a settings update or member action fails due to a network error, the UI shows an error notification and does not update local state.
- **Last owner**: An owner cannot remove themselves while they are the sole owner. The members page shows a prominent warning in this state and directs the owner to assign the owner role to another member first. Once at least one other owner exists, any owner may remove themselves.
- **Last administrator self-demotion**: When a user is the last administrator, their own role dropdown disables all options below "administrator" with a tooltip. When multiple administrators exist, the user may demote themselves freely.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display each project's name, description, role badge, and last-updated date on the dashboard
- **FR-002**: System MUST show archived projects only when the user explicitly opts in via a toggle or filter
- **FR-003**: System MUST render a project settings page accessible only to members with administrator or owner role
- **FR-004**: System MUST validate all project settings form fields on the client before sending a request to the server
- **FR-005**: System MUST display inline validation errors for each field that fails validation, without clearing other field values
- **FR-006**: System MUST save settings changes without a full page reload and show a success or error notification
- **FR-007**: System MUST display a members table listing each member's name, email, role, and join date
- **FR-008**: System MUST allow administrators and owners to change a member's role via an inline dropdown, saving immediately on selection; only owners may assign or remove the owner role
- **FR-009**: System MUST require a confirmation step before removing a member
- **FR-010**: System MUST block removal of the last remaining owner and display an explanatory message directing the user to assign the owner role to another member first
- **FR-011**: System MUST block both removal of the last administrator and self-demotion by the last administrator; in the latter case the role dropdown MUST disable options below "administrator" for the user's own row and display an explanatory tooltip
- **FR-024**: System MUST display a prominent warning on the members page when the current user is the sole owner, informing them that they cannot remove themselves until the owner role has been assigned to at least one other member
- **FR-012**: System MUST provide an invite form with an autocomplete search field that surfaces registered users matching the query by name or email, excluding users already in the project
- **FR-013**: System MUST show an empty-results message when no registered users outside the project match the search query; free-text email submission is not permitted
- **FR-014**: System MUST exclude current project members from autocomplete results, preventing duplicate-member submissions
- **FR-015**: System MUST restrict the invitation form to administrator and owner roles only
- **FR-016**: System MUST allow project owners to archive a project via a settings action with a confirmation step
- **FR-017**: System MUST display archived projects in read-only mode with a visible archive banner
- **FR-018**: System MUST allow project owners to restore archived projects
- **FR-019**: System MUST allow project owners to permanently delete a project after a two-step confirmation requiring the user to type the project name
- **FR-020**: System MUST redirect non-owners away from archive/restore and delete controls — these controls MUST NOT be rendered for non-owners
- **FR-021**: System MUST redirect the user to the dashboard after successful project deletion with a confirmation notice
- **FR-022**: System MUST render the settings page of an archived project with all form fields and member management actions disabled; only the restore and delete actions remain interactive, and a prominent archive banner MUST be displayed at the top of the page
- **FR-023**: System MUST not expose role-restricted UI elements to users without the required role, even transiently

### Security Requirements

- **SR-001**: All form submissions that mutate project data MUST be sent over authenticated sessions; the frontend MUST NOT store session tokens in client-accessible storage
- **SR-002**: Role-based UI MUST be enforced server-side; client-side hiding of controls is for UX only and MUST NOT be treated as a security boundary
- **SR-003**: Destructive actions (delete, remove member) MUST require an explicit confirmation interaction before the request is sent
- **SR-004**: Error messages returned from the server MUST NOT expose internal identifiers, stack traces, or database details; the frontend MUST display only user-safe error text
- **SR-005**: Direct URL access to any settings page MUST verify the user's role server-side before rendering; an insufficient-role response returns a 403 page
- **SR-006**: The project name confirmation step for deletion MUST be validated client-side to prevent accidental activation

### Key Entities

- **Project**: Name, optional description, optional tags, archive status, one or more owners (multiple owners can coexist), last-updated timestamp
- **ProjectMember**: The current user's membership record including role (viewer, editor, administrator, owner) and join date
- **Invitation**: Target email address, assigned role, and current project context — ephemeral, not persisted on the client

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A project administrator can complete the full settings update flow (open form, edit, save, see confirmation) in under 60 seconds
- **SC-002**: A project administrator can invite a new member and see them in the member list in under 30 seconds
- **SC-003**: All destructive actions (delete, remove member, archive) require at least one additional confirmation step — zero such actions complete in a single click
- **SC-004**: Role-restricted pages return a visible "not authorised" screen and no editable controls when accessed without the required role
- **SC-005**: All client-side form validation errors surface before a network request is made, giving the user immediate feedback
- **SC-006**: The project list, settings page, and members tab each load and are interactive within 2 seconds on a standard broadband connection

## Assumptions

- The project management API (spec 006) is fully implemented and available; this spec covers only the frontend layer
- Session-based authentication is already in place (spec 007); this feature reuses the existing session mechanism
- The roles available are exactly: viewer, editor, administrator, owner — no new role types are introduced
- Only registered users can be added to a project; the invite form's autocomplete excludes unregistered addresses entirely — no pending-invite state is needed
- The owner role can be assigned to any existing project member by a current owner via the role dropdown on the members page; there must always be at least one owner per project
- Pagination of the members list is out of scope; projects are assumed to have a manageable number of members in this phase
- The project dashboard (list view) is the same page introduced in spec 006 — this spec extends it with archive filtering and role-aware card actions
- Mobile responsiveness follows the same baseline as the rest of the application; no dedicated mobile design is required beyond standard responsive layout
