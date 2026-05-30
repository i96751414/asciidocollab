# Feature Specification: Project Management

**Feature Branch**: `006-project-management`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Phase 4: Project management (CRUD + member management — API + dashboard UI)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Project List (Priority: P1)

As a registered user, I want to see all my projects in a dashboard so I can quickly access my work.

**Why this priority**: This is the entry point for all project interactions. Without a project list, users cannot access or manage their projects.

**Independent Test**: Can be fully tested by logging in and viewing the dashboard. Delivers immediate value by showing users their projects.

**Acceptance Scenarios**:

1. **Given** I am logged in, **When** I navigate to the dashboard, **Then** I see a list of all projects I own or am a member of
2. **Given** I have multiple projects, **When** I view the project list, **Then** projects are sorted by last updated (most recent first)
3. **Given** I have no projects, **When** I view the dashboard, **Then** I see an empty state with a prompt to create my first project
4. **Given** I am a member of projects with different roles, **When** I view the project list, **Then** I see my role for each project (owner, administrator, editor, viewer)

---

### User Story 2 - Create New Project (Priority: P1)

As a registered user, I want to create a new project so I can start collaborating on documentation.

**Why this priority**: Project creation is fundamental to the application's purpose. Users must be able to start new projects to use the system.

**Independent Test**: Can be tested by creating a project and verifying it appears in the project list. Delivers core value.

**Acceptance Scenarios**:

1. **Given** I am on the dashboard, **When** I click "Create Project" and fill in the name, **Then** a new project is created and I am added as the owner
2. **Given** I am creating a project, **When** I provide a name, description, and tags, **Then** the project is created with those details
3. **Given** I am creating a project, **When** I provide an invalid name (too long, empty, or duplicate), **Then** I see a clear error message
4. **Given** I create a project, **When** the project is created, **Then** I am automatically added as an administrator member

---

### User Story 3 - Edit Project Settings (Priority: P2)

As a project owner or administrator, I want to update project details (name, description, tags) so I can keep project information current.

**Why this priority**: Projects evolve over time. The ability to update details keeps the system useful and organized.

**Independent Test**: Can be tested by editing project details and verifying changes persist. Delivers maintenance value.

**Acceptance Scenarios**:

1. **Given** I am a project administrator, **When** I update the project name, **Then** the change is saved and reflected immediately
2. **Given** I am a project administrator, **When** I update the description or tags, **Then** the changes are saved
3. **Given** I am a project viewer or editor, **When** I try to access project settings, **Then** I see a read-only view or am prevented from making changes
4. **Given** I update project details, **When** the update succeeds, **Then** I see a confirmation message

---

### User Story 4 - Manage Project Members (Priority: P2)

As a project administrator, I want to invite users, change their roles, or remove them from the project so I can control team access.

**Why this priority**: Collaboration requires team management. This enables controlled access to projects.

**Independent Test**: Can be tested by inviting a user, changing their role, and removing them. Delivers collaboration control.

**Acceptance Scenarios**:

1. **Given** I am a project administrator, **When** I invite a user by email with a role, **Then** they are added as a member with that role
2. **Given** I am a project administrator, **When** I change a member's role, **Then** the role is updated immediately
3. **Given** I am a project administrator, **When** I remove a member, **Then** they lose access to the project
4. **Given** I am a project administrator, **When** I try to remove the project owner, **Then** I see an error message
5. **Given** I am a project administrator, **When** I try to remove the last administrator, **Then** I see an error message

---

### User Story 5 - Archive/Restore Project (Priority: P3)

As a project owner, I want to archive a project I'm no longer actively working on so I can hide it from my active project list without deleting it.

**Why this priority**: Archiving provides a clean way to organize active vs. inactive projects without data loss.

**Independent Test**: Can be tested by archiving a project and verifying it's hidden from the default list, then restoring it.

**Acceptance Scenarios**:

1. **Given** I am a project owner, **When** I archive a project, **Then** it is removed from the default project list
2. **Given** I have archived projects, **When** I view archived projects, **Then** I can see and restore them
3. **Given** I archive a project, **When** I try to access it, **Then** I can still view its contents but editing is restricted
4. **Given** I restore an archived project, **When** the restore completes, **Then** it reappears in my active project list

---

### Edge Cases

- **Already a member**: Invitation returns 409 Conflict with error message "User is already a member of this project"
- **Project limit**: No limit enforced in Phase 4; system allows unlimited projects per user
- **Removed from project**: User receives 403 Forbidden; project is hidden from their dashboard
- **Concurrent operations**: Last write wins; optimistic locking not required for Phase 4
- **Duplicate project name**: Returns 409 Conflict with error message "A project with this name already exists"
- **Network errors**: Client displays generic error message; no retry logic required for Phase 4

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display all projects where the user is a member (owner, administrator, editor, or viewer)
- **FR-002**: System MUST allow authenticated users to create new projects with a name, optional description, and optional tags
- **FR-003**: System MUST add the project creator as an administrator member automatically
- **FR-004**: System MUST allow project administrators to update project name, description, and tags
- **FR-005**: System MUST allow project administrators to invite users by email address
- **FR-006**: System MUST allow project administrators to change member roles (viewer, editor, administrator)
- **FR-007**: System MUST allow project administrators to remove members from the project
- **FR-008**: System MUST prevent removal of the project owner
- **FR-009**: System MUST prevent removal of the last administrator
- **FR-010**: System MUST allow project owners to archive projects (soft delete)
- **FR-011**: System MUST allow project owners to restore archived projects
- **FR-012**: System MUST enforce role-based access control (viewers cannot edit, editors cannot manage members)
- **FR-013**: System MUST validate project names (non-empty, maximum length, unique per owner)
- **FR-014**: System MUST track project creation and update timestamps
- **FR-015**: System MUST log all project and member changes for audit purposes

### Key Entities

- **Project**: Represents a documentation project with name, description, owner, tags, and archive status
- **ProjectMember**: Represents a user's membership in a project with a specific role (viewer, editor, administrator)
- **User**: Registered user who can own projects and be a member of multiple projects

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a new project with name, description, and tags
- **SC-002**: Users can view all their projects in a dashboard with role information
- **SC-003**: Project settings changes are reflected immediately without page refresh
- **SC-004**: Users can invite members by email and assign roles
- **SC-005**: Archived projects are hidden from default view and can be restored

## Assumptions

- Users have valid email addresses for member invitations
- The existing authentication system (session-based) will be used for all API calls
- Project limits (if any) are configured at the system level, not per-user
- Email notifications for invitations are out of scope for this phase (manual invitation only)
- Real-time collaboration features are handled in later phases
- The UI should feel lightweight, immediate, and stable, positioned as professional collaborative technical publishing
