# Feature Specification: Database Layer

**Feature Branch**: `002-database-layer`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "start phase 2"

## User Scenarios & Testing

### User Story 1 - System persists and retrieves project data correctly (Priority: P1)

As a developer integrating with the persistence layer, I want all 9 domain entities to be stored in and retrieved from PostgreSQL so that data survives restarts and can be queried efficiently.

**Why this priority**: This is the foundational capability — every downstream feature (API, auth, collaboration) depends on working persistence.

**Independent Test**: Can be fully tested by running integration tests against a real database, verifying each CRUD operation against every repository implementation.

**Acceptance Scenarios**:

1. **Given** a clean database, **When** a project is saved, **Then** retrieving it by ID returns the same project with all fields preserved.
2. **Given** a saved project, **When** it is updated, **Then** retrieving it by ID returns the updated fields.
3. **Given** a saved project, **When** it is deleted, **Then** retrieving it by ID returns nothing.

---

### User Story 2 - File tree operations handle parent-child relationships correctly (Priority: P1)

As a developer managing file tree operations, I want FileNode CRUD and move operations to work correctly so that projects maintain valid folder structures.

**Why this priority**: File management is core to the editor experience and involves the most complex relationships (self-referencing FK, cascade deletes).

**Independent Test**: Can be fully tested by creating folder hierarchies and verifying child queries, moves, and cascade delete behavior.

**Acceptance Scenarios**:

1. **Given** a project with a root folder, **When** a child folder is created under it, **Then** querying children of the root returns the child.
2. **Given** a folder with child files, **When** the folder is deleted, **Then** all child files are also deleted.
3. **Given** a file node, **When** it is moved to a new parent, **Then** querying it shows the new parent.

---

### User Story 3 - Role and member management queries work correctly (Priority: P1)

As a developer implementing access control, I want ProjectMember repository methods to correctly filter by project, user, and composite key.

**Why this priority**: Access control gates every user-facing feature.

**Independent Test**: Can be fully tested by creating members with different roles and verifying query methods return correct results.

**Acceptance Scenarios**:

1. **Given** a project with multiple members, **When** members are queried by project, **Then** all members are returned.
2. **Given** a member with a viewer role, **When** their role is changed to administrator, **Then** querying their membership shows the new role.
3. **Given** a member, **When** they are removed from the project, **Then** querying their membership returns nothing.

---

### User Story 4 - Document and Git repository lookups work correctly (Priority: P2)

As a developer implementing the editor, I want Document and GitRepository repositories to support one-to-one lookups from FileNode and Project respectively.

**Why this priority**: Document and Git repositories support editor and git integration features but aren't blocking for basic CRUD.

**Independent Test**: Can be fully tested by creating and querying documents by fileNodeId and git repos by projectId.

**Acceptance Scenarios**:

1. **Given** a document linked to a file node, **When** queried by that file node, **Then** the correct document is returned.
2. **Given** a git repository linked to a project, **When** queried by that project, **Then** the correct repository is returned.

---

### User Story 5 - Audit log and image repositories handle filtering correctly (Priority: P2)

As a developer implementing audit and media features, I want AuditLog and Image repositories to support efficient filtering by project and user.

**Why this priority**: These are secondary features needed for compliance and media management.

**Independent Test**: Can be fully tested by creating audit entries and images and verifying query methods.

**Acceptance Scenarios**:

1. **Given** multiple audit log entries for different projects, **When** queried by project, **Then** only matching entries are returned.
2. **Given** images in a project, **When** queried by project, **Then** all project images are returned.

---

### Edge Cases

- What happens when saving an entity with an ID that already exists? (upsert behavior — should update)
- What happens when querying for a non-existent ID? (should return null, not throw)
- What happens when deleting a non-existent entity? (repository should handle gracefully or let the error propagate)
- What happens with very long strings for path, remoteUrl, or metadata fields? (database should handle large text values)
- What happens when metadata is empty? (saved as null or empty value)

## Requirements

### Functional Requirements

- **FR-001**: System MUST persist all 9 domain entity types to PostgreSQL.
- **FR-002**: System MUST support CRUD operations (create, read, update, delete) for all entities.
- **FR-003**: The User repository MUST support lookup by ID and email, and persist user data.
- **FR-004**: The Project repository MUST support lookup by ID and owner, and persist and delete project data.
- **FR-005**: The ProjectMember repository MUST support lookup by project, user, and composite key; add, remove, and update role for members.
- **FR-006**: The FileNode repository MUST support lookup by ID, parent, and project; persist and delete nodes; and move nodes to new parents.
- **FR-007**: The Document repository MUST support lookup by ID and file node ID (single and batch), and persist and delete documents.
- **FR-008**: The Image repository MUST support lookup by ID and project, and persist and delete images.
- **FR-009**: The Template repository MUST support lookup by ID, list all templates, and persist and delete templates.
- **FR-010**: The GitRepository repository MUST support lookup by ID and project, and persist and delete git repository configurations.
- **FR-011**: The AuditLog repository MUST support saving entries, lookup by project and user, and listing all entries.
- **FR-012**: Entity-to-database mapping MUST preserve all field types: identifiers, date values, enum fields, and structured metadata.
- **FR-013**: The database schema MUST define indexes on foreign key columns and commonly queried fields (projectId, userId, parentId) for query performance.
- **FR-014**: Each repository implementation MUST be independently testable against a real database instance.

### Key Entities

- **User**: Primary identity entity. Fields: id (UUID), email (unique), displayName, passwordHash (nullable), samlSubject (nullable), mfaSecret (nullable), timestamps.
- **Project**: Top-level container. Fields: id (UUID), name, description (nullable), ownerId (FK to User), tags, rootFolderId (FK to FileNode), timestamps.
- **ProjectMember**: Join entity between User and Project with role. Fields: projectId (FK), userId (FK), role (VIEWER/EDITOR/ADMINISTRATOR), joinedAt.
- **FileNode**: Tree node in project file hierarchy. Fields: id (UUID), projectId (FK), parentId (self-FK, nullable), name, type (FILE/FOLDER), path, timestamps.
- **Document**: Content container for a FileNode. Fields: id (UUID), fileNodeId (unique FK), contentId, yjsStateId, mimeType, timestamps.
- **Image**: Image metadata within a project. Fields: id (UUID), projectId (FK), filename, storagePath, mimeType, sizeBytes, parentId (nullable), uploadedAt, updatedAt.
- **Template**: Reusable document template. Fields: id (UUID), name, description (nullable), category, sourceProjectId (FK, nullable), createdAt.
- **GitRepository**: Git remote configuration per project. Fields: id (UUID), projectId (unique FK), provider (GITHUB/GITLAB/BITBUCKET), remoteUrl, credentialRef, currentBranch, lastSyncAt, createdAt.
- **AuditLog**: Immutable audit trail. Fields: id (UUID), userId (FK), projectId (nullable FK), action, resourceType, resourceId, timestamp, metadata (JSON).

## Success Criteria

### Measurable Outcomes

- **SC-001**: All 9 repository implementations pass integration tests against a real database instance.
- **SC-002**: Each repository test suite covers CRUD operations, null/optional field handling, and error cases.
- **SC-003**: All database-to-domain type mappings (identifiers, dates, enums, structured metadata) are covered by tests.
- **SC-004**: `pnpm build`, `pnpm test`, `pnpm typecheck`, and `pnpm fresh-onion` all pass on the root monorepo.
- **SC-005**: Architectural boundaries enforces that infrastructure code imports domain code but not vice versa.

## Assumptions

- PostgreSQL is the target database (as defined in the architecture design doc).
- UUID v4 format is used for all entity IDs, matching the domain layer conventions.
- Native PostgreSQL `uuid` type is used for all UUID columns (not plain text).
- Cascade deletes are used for child entities (FileNode children, ProjectMember on project delete) to maintain referential integrity.
- The architecture design doc at `docs/superpowers/specs/2026-05-26-asciidocollab-architecture-design.md` defines the canonical scope and approach for Phase 2.
