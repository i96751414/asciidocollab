# Feature Specification: Monorepo Scaffold & Domain Layer

**Feature Branch**: `001-domain-layer-scaffold`

**Created**: 2026-05-26

**Status**: Draft

**Input**: User description: "Monorepo scaffold + domain layer (entities, value objects, use cases, errors — pure TypeScript, in-memory-tested, zero external deps)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set Up Monorepo Workspace (Priority: P1)

As a developer, I want a working monorepo with pnpm workspaces so that I can
develop, build, and test all packages from a single entry point.

**Why this priority**: Every subsequent user story depends on a functioning
monorepo with shared tooling.

**Independent Test**: A developer can run `pnpm install && pnpm build` and see
all packages compile successfully.

**Acceptance Scenarios**:

1. **Given** the project root, **When** a developer runs `pnpm install`,
   **Then** all dependencies for all packages install without errors.
2. **Given** all dependencies installed, **When** a developer runs `pnpm build`,
   **Then** all packages compile without errors.
3. **Given** configuration files exist, **When** a developer runs `pnpm lint`,
   **Then** linting passes across all packages.
4. **Given** TypeScript configs are in place, **When** a developer runs
   `pnpm typecheck`, **Then** type checking passes across all packages.

---

### User Story 2 - Define Core Domain Entities (Priority: P1)

As a developer, I want pure TypeScript domain entities with no external
dependencies so that the domain layer remains framework-agnostic and
independently testable.

**Why this priority**: Domain entities are the foundation of the architecture.
All use cases, repositories, and infrastructure depend on them.

**Independent Test**: Each entity can be instantiated and its invariants
validated in a pure Node.js environment without loading any database, HTTP, or
filesystem modules.

**Acceptance Scenarios**:

1. **Given** a User entity, **When** created with valid email and display name,
   **Then** it is in a valid state.
2. **Given** a Project entity, **When** created with a name and owner, **Then**
   it has no rootFolderId until one is assigned.
3. **Given** a FileNode entity, **When** created with type=folder and
   parentId=null, **Then** it is the root folder.
4. **Given** a FileNode entity, **When** created with type=file, **Then** its
   parentId MUST be set.
5. **Given** a Document entity, **When** created, **Then** it references exactly
   one FileNode.
6. **Given** a ProjectMember entity, **When** created, **Then** the role MUST be
   one of viewer, editor, or administrator.
7. **Given** a GitRepository entity, **When** created, **Then** it references
   exactly one Project.
8. **Given** an AuditLog entry, **When** created, **Then** it has a userId,
   action, resourceType, resourceId, and timestamp.

---

### User Story 3 - Define Value Objects (Priority: P1)

As a developer, I want strongly-typed value objects for core domain primitives
so that invalid data cannot represent valid domain state.

**Why this priority**: Value objects prevent primitive obsession and encode
domain rules at the type level.

**Independent Test**: Each value object validates its input at construction time
and rejects invalid values.

**Acceptance Scenarios**:

1. **Given** a ProjectId value object, **When** created from a valid UUID,
   **Then** it holds the UUID.
2. **Given** a ProjectId, **When** created from an invalid string, **Then**
   construction fails.
3. **Given** a UserId value object, **When** created from a valid UUID, **Then**
   it holds the UUID.
4. **Given** a FilePath value object, **When** created from a valid path,
   **Then** it represents the path.
5. **Given** a Role value object, **When** created with "editor", **Then** it
   equals Role.Editor.
6. **Given** a Role, **When** created with "superadmin", **Then** construction
   fails.
7. **Given** two ProjectId objects with the same UUID, **When** compared,
   **Then** they are equal.
8. **Given** two different Email value objects, **When** compared, **Then** they
   differ based on the normalized value.

---

### User Story 4 - Define Repository Interfaces (Priority: P1)

As a developer, I want TypeScript repository interfaces in the domain layer so
that use cases depend on abstractions, not concrete implementations.

**Why this priority**: Repository interfaces are the seam between domain and
infrastructure. They enable in-memory testing and infrastructure swapping.

**Independent Test**: Each repository interface defines full CRUD and query
methods. An in-memory fake can implement the interface without a database.

**Acceptance Scenarios**:

1. **Given** a ProjectRepository interface, **When** a developer implements it,
   **Then** it supports findById, findByOwnerId, save, and delete operations.
2. **Given** a DocumentRepository interface, **When** implemented, **Then** it
   supports findById, findByFileNodeId, save, and delete operations.
3. **Given** a UserRepository interface, **When** implemented, **Then** it
   supports findById, findByEmail, and save operations.
4. **Given** a FileNodeRepository interface, **When** implemented, **Then** it
   supports findById, findByParentId, findByProjectId, save, move, and delete
   operations.
5. **Given** a ProjectMemberRepository interface, **When** implemented, **Then**
   it supports findByProjectId, findByUserId, addMember, removeMember, and
   updateRole operations.
6. **Given** a GitRepositoryRepository interface, **When** implemented, **Then**
   it supports findByProjectId, save, and delete operations.

---

### User Story 5 - Implement Core Use Cases (Priority: P1)

As a developer, I want domain use cases that encapsulate business logic so that
operations like creating a project enforce domain invariants.

**Why this priority**: Use cases are the application's entry point for business
operations. They orchestrate entities, value objects, and repository calls.

**Independent Test**: Each use case can be tested against an in-memory fake
repository and produce the expected domain events or results.

**Acceptance Scenarios**:

1. **Given** valid input for CreateProject, **When** executed, **Then** a
   Project, a root FileNode, and the project owner as administrator are all
   created atomically, and an AuditLog entry with action "project.created"
   is created.
2. **Given** a CreateProject call with an empty name, **When** executed, **Then**
   the use case returns an error and no project is created.
3. **Given** a RenameFile use case with a valid target, **When** executed by an
   authorized user, **Then** the file is renamed and an AuditLog entry with
   action "file.renamed" is created.
4. **Given** a RenameFile use case with an unauthorized user, **When** executed,
   **Then** a PermissionDeniedError is returned.
5. **Given** a DeleteFile use case, **When** executed on a non-existent file,
   **Then** an error is returned.
6. **Given** an InviteUser use case, **When** executed by a project
   administrator, **Then** a ProjectMember is created with the specified role
   and an AuditLog entry with action "member.invited" is created.
7. **Given** an InviteUser use case, **When** executed by a viewer, **Then** a
   PermissionDeniedError is returned.
8. **Given** a GetProjectTree use case, **When** executed with a valid project
   ID, **Then** the full file tree is returned as a nested structure.

---

### User Story 6 - In-Memory Fake Repositories & Tests (Priority: P2)

As a developer, I want in-memory implementations of all repository interfaces so
that use cases can be tested without infrastructure.

**Why this priority**: In-memory fakes enable fast, reliable unit tests and
serve as a living specification of repository contracts.

**Independent Test**: An in-memory fake passes the same contract tests that the
real infrastructure implementation will later be tested against.

**Acceptance Scenarios**:

1. **Given** an in-memory ProjectRepository, **When** a project is saved and
   retrieved by ID, **Then** the retrieved project matches the saved one.
2. **Given** an in-memory ProjectRepository, **When** searching by owner ID,
   **Then** only projects belonging to that owner are returned.
3. **Given** an in-memory FileNodeRepository, **When** a root folder is created,
   **Then** its parentId is null.
4. **Given** an in-memory FileNodeRepository, **When** a file is moved to a new
   parent, **Then** its parentId updates correctly.
5. **Given** an in-memory UserRepository, **When** looking up by email, **Then**
   the correct user is returned (case-insensitive).
6. **Given** all in-memory fakes, **When** all use-case tests are run, **Then**
   they complete in under 5 seconds.

### Edge Cases

- What happens when a project name is empty or only whitespace? → rejected
- What happens when a user has no projects? → empty list returned
- What happens when a file node is deleted while still referenced by a document?
  → cascade or block based on domain rules
- What happens when a rename targets a name that already exists in the parent
  folder? → FileConflictError returned
- What happens when a non-existent project ID is queried? → error returned
- What happens when a user is invited to a project they are already a member of?
  → duplicate detected, error returned
- What happens when the root folder is targeted for deletion? → prevented
- What happens when two users have the same normalized email? → unique
  constraint enforced in validation

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The monorepo MUST support pnpm workspaces with a root
  `pnpm-workspace.yaml` that defines all packages.
- **FR-002**: The monorepo MUST include TypeScript configuration with
  `strict: true` for all packages.
- **FR-003**: The monorepo MUST support `pnpm lint` across all packages with a
  shared ESLint configuration.
- **FR-004**: The monorepo MUST support `pnpm build` across all packages with
  proper dependency ordering.
- **FR-005**: The monorepo MUST support `pnpm test` that runs all tests across
  all packages.
- **FR-006**: The domain package MUST have zero external npm dependencies.
- **FR-007**: The domain package MUST define these entities: User, Project,
  ProjectMember, FileNode, Document, GitRepository, Template, Image, AuditLog.
- **FR-008**: The domain package MUST define value objects for: ProjectId,
  UserId, FileNodeId, DocumentId, GitRepositoryId, TemplateId, ImageId,
  AuditLogId, Email, FilePath, Role (viewer/editor/administrator), ProjectName,
  GitProvider (github/gitlab/bitbucket), MimeType, FileNodeType (file/folder),
  ContentId, YjsStateId, TemplateCategory.
- **FR-009**: The domain package MUST define repository interfaces for:
  ProjectRepository, DocumentRepository, UserRepository, FileNodeRepository,
  ProjectMemberRepository, GitRepositoryRepository, TemplateRepository,
  ImageRepository, AuditLogRepository.
- **FR-010**: The domain package MUST define typed domain error classes:
  ProjectNotFoundError, UserNotFoundError, FileNodeNotFoundError,
  PermissionDeniedError, DuplicateEmailError, InvalidProjectNameError,
  FileConflictError, ProjectMemberAlreadyExistsError,
  CannotRemoveOwnerError, CannotChangeOwnerRoleError,
  CannotRemoveLastAdminError, CannotAttachDocumentToFolderError.
- **FR-011**: The shared package MUST define DTOs for cross-boundary
  communication: CreateProjectRequest, CreateProjectResponse, RenameFileRequest,
  RenameFileResponse, InviteUserRequest, InviteUserResponse, etc.
- **FR-012**: The domain package MUST define these use cases: CreateProject,
  RenameFile, DeleteFile, InviteUser, RemoveMember, ChangeMemberRole,
  GetProjectTree.
- **FR-013**: All domain entities MUST validate their invariants at domain
  boundaries (after construction or after mutation) — invalid state MUST be
  impossible to represent.
- **FR-014**: The CreateProject use case MUST enforce the project creation
  invariant atomically: create Project entity (rootFolderId tentatively null),
  create root FileNode, assign rootFolderId — all within a single logical
  transaction. The invariant "rootFolderId is never null" is checked at use
  case completion, not at entity construction.
- **FR-015**: Permission checks MUST be embedded in use cases, not in callers.
- **FR-016**: All use cases MUST return a `Result<T, DomainError>` discriminated
  union type — exceptions MUST NOT be used for control flow.
- **FR-017**: In-memory fake implementations MUST exist for all repository
  interfaces defined by FR-009.
- **FR-018**: All mutating use cases (CreateProject, RenameFile, DeleteFile,
  InviteUser, RemoveMember, ChangeMemberRole) MUST create an AuditLog entry
  upon successful execution. GetProjectTree is exempted (read-only).

### Key Entities *(include if feature involves data)*

- **User**: Core identity. Has id (UserId), email (Email), displayName,
  passwordHash (optional), samlSubject (optional), mfaSecret (optional),
  createdAt, updatedAt.
- **Project**: Collaboration container. Has id (ProjectId), name (ProjectName),
  description (optional), ownerId (UserId), tags, rootFolderId (FileNodeId),
  createdAt, updatedAt, archivedAt (optional).
- **ProjectMember**: User-Project association with role. Has projectId
  (ProjectId), userId (UserId), role (Role), joinedAt.
- **FileNode**: File or folder in the project tree. Has id (FileNodeId),
  projectId (ProjectId), parentId (FileNodeId, optional — null only for root
  folder), name, type (FileNodeType), path, createdAt, updatedAt.
- **Document**: AsciiDoc text document. Has id (DocumentId), fileNodeId
  (FileNodeId), contentId (ContentId), yjsStateId (YjsStateId), mimeType.
- **GitRepository**: Git integration config. Has id (GitRepositoryId), projectId
  (ProjectId), provider (GitProvider), remoteUrl, credentialRef, currentBranch,
  lastSyncAt (optional), createdAt.
- **Template**: Document template. Has id (TemplateId), name, description
  (optional), category (TemplateCategory), sourceProjectId (optional), createdAt.
- **Image**: Image asset with version tracking. Has id (ImageId), projectId
  (ProjectId), filename, storagePath, mimeType, sizeBytes, parentId (optional),
  uploadedAt, updatedAt (optional).
- **AuditLog**: Security audit entry. Has id (AuditLogId), userId (UserId),
  projectId (optional), action, resourceType, resourceId, timestamp, metadata.
  Written by all mutating use cases on success.
- **Result<T, E>**: Generic discriminated union type for fallible operations in
  the domain layer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All domain entities compile with zero external dependencies —
  verified by inspecting `packages/domain/package.json` for zero runtime deps
  and running `pnpm build --filter=domain` successfully.
- **SC-002**: All repository interfaces have corresponding in-memory fake
  implementations — verified by automated test enumeration.
- **SC-003**: All use cases have passing tests using in-memory fakes — verified
  by `pnpm test --filter=domain` with 100% pass rate.
- **SC-004**: The CreateProject use case enforces the project creation invariant
  atomically — verified by integration test that checks Project, FileNode, and
  ProjectMember are created together.
- **SC-005**: All domain errors are typed and returned as `Result` type — no
  exceptions used for control flow in the domain layer.
- **SC-006**: Monorepo build completes in under 60 seconds on a standard
  development machine — verified by timed `pnpm build`.
- **SC-007**: Linting and type checking pass with zero errors — verified by
  `pnpm lint` and `pnpm typecheck`.
- **SC-008**: Every mutating use case produces an AuditLog entry — verified by
  integration tests that inspect the in-memory AuditLogRepository after each
  successful use case execution.

## Clarifications

### Session 2026-05-26

- Q: Which Node.js LTS version should Phase 1 target? → A: Node.js 24.x (Active LTS "Krypton")

## Assumptions

- **Runtime**: Node.js 24.x (Active LTS "Krypton") is the target runtime for
  all packages. The `engines` field in root `package.json` enforces this.
- **TypeScript-first**: All code is written in TypeScript. No raw JavaScript
  files in the domain layer.
- **Pure domain**: The domain package has zero runtime dependencies. Dev
  dependencies (TypeScript, ESLint) are permitted.
- **No framework coupling**: Domain uses no decorators, no class-transformer, no
  class-validator, no dependency injection framework.
- **Value object equality**: Value objects implement structural equality (two
  objects with the same value are equal), not reference equality.
- **Feature scope boundary**: This phase does NOT include any infrastructure
  code (Prisma, Fastify, filesystem) — only interfaces, not implementations.
- **No frontend code**: Phase 1 produces no UI components or pages. The `apps/`
  directories exist as shells.
- **No collaboration code**: Phase 1 does not include Yjs or Hocuspocus.
- **Build tooling**: ESLint + Prettier for code quality; tsconfig paths for
  cross-package imports in the monorepo.
- **Test framework**: Jest with ts-jest for domain testing. In-memory fakes for
  repository interfaces.
- **Entity IDs**: All entity IDs are UUIDs (v4). Value objects wrap UUIDs with
  validation.
- **Timestamps**: All date/time fields use the native `Date` type. Values are normalized to UTC.
