---

description: "Implementation tasks for Phase 1: Monorepo Scaffold & Domain Layer"
---

# Tasks: 001-domain-layer-scaffold

**Input**: Design documents from `specs/001-domain-layer-scaffold/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md

**Tests**: All tasks follow TDD (red-green-refactor). Tests are written first and verified to fail before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Constitution**:
- Zero external deps for `packages/domain`
- `strict: true` on all tsconfig
- `Result<T,E>` for fallible operations (no exceptions for control flow)
- No `any`, no `as` casts
- RBAC in use cases, typed errors
- fresh-onion 1.0.10 for layer validation
- Code coverage >= 90% (domain exempted)
- In-memory fakes, no mocking libraries

---

## Phase 1: Setup — Monorepo Workspace (User Story 1, P1)

**Purpose**: Initialize pnpm workspace with root configuration files, shared tooling, and package shells.

**Independent Test**: `pnpm install && pnpm build` completes without errors.

- [X] T001 Create `pnpm-workspace.yaml` defining packages/ and apps/ directories
- [X] T002 [P] Create root `package.json` with build, lint, test, test:coverage, typecheck, fresh-onion scripts and `engines` field (Node.js >=24)
- [X] T003 [P] Create root `tsconfig.json` with strict:true, project references pointing to packages/domain and packages/shared
- [X] T004 [P] Create root `.eslintrc.cjs` with TypeScript rules and Prettier integration
- [X] T005 [P] Create root `.prettierrc` with project formatting rules
- [X] T006 [P] Create `onion.config.json` for fresh-onion 1.0.10 layer boundary validation (domain depends on nothing, shared depends on nothing)
- [X] T007 [P] Create `.gitignore` for Node.js monorepo (node_modules, dist, coverage, .env)
- [X] T008 [P] Create shell packages: `packages/infrastructure/package.json`, `packages/collaboration/package.json`, `packages/db/package.json`, `apps/web/package.json`, `apps/api/package.json`, `docker/git-sandbox/`, `docker/pdf/` (minimal `{}` package.json each)

**Checkpoint**: Workspace scaffolded — `pnpm install` runs cleanly.

---

## Phase 2: Foundational — Shared Infrastructure

**Purpose**: Core types and package configuration that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T009 [P] Create `packages/domain/package.json` with zero runtime dependencies, name "@asciidocollab/domain", build script, and Jest test config
- [X] T010 [P] Create `packages/shared/package.json` with name "@asciidocollab/shared", build and test scripts
- [X] T011 [P] Create `packages/domain/tsconfig.json` with strict:true, composite:true, outDir:dist, rootDir:src
- [X] T012 [P] Create `packages/shared/tsconfig.json` with strict:true, composite:true, outDir:dist, rootDir:src
- [X] T013 [P] Create `packages/domain/jest.config.ts` with ts-jest preset, coverageThreshold 90% (exclude domain)
- [X] T014 [P] Create `packages/shared/jest.config.ts` with ts-jest preset
- [X] T015 [P] Create `packages/domain/src/index.ts` barrel export file
- [X] T016 [P] Create `packages/shared/src/index.ts` barrel export file
- [X] T017 Create `Result<T,E>` discriminated union type in `packages/shared/src/types/result.ts`:
  ```typescript
  type Result<T, E extends DomainError> =
    | { success: true; value: T }
    | { success: false; error: E };
  ```
- [X] T018 Create base `DomainError` abstract class in `packages/domain/src/errors/domain-error.ts` with name property and Error inheritance
- [X] T019 [P] Create all 12 error classes in `packages/domain/src/errors/`:
  - `project-not-found.ts`: ProjectNotFoundError extends DomainError
  - `user-not-found.ts`: UserNotFoundError extends DomainError
  - `file-node-not-found.ts`: FileNodeNotFoundError extends DomainError
  - `permission-denied.ts`: PermissionDeniedError extends DomainError
  - `duplicate-email.ts`: DuplicateEmailError extends DomainError
  - `invalid-project-name.ts`: InvalidProjectNameError extends DomainError
  - `file-conflict.ts`: FileConflictError extends DomainError
  - `project-member-already-exists.ts`: ProjectMemberAlreadyExistsError extends DomainError
  - `cannot-remove-owner.ts`: CannotRemoveOwnerError extends DomainError
  - `cannot-change-owner-role.ts`: CannotChangeOwnerRoleError extends DomainError
  - `cannot-remove-last-admin.ts`: CannotRemoveLastAdminError extends DomainError
  - `cannot-attach-document-to-folder.ts`: CannotAttachDocumentToFolderError extends DomainError
- [X] T020 Create errors barrel index in `packages/domain/src/errors/index.ts` re-exporting all 12 errors

**Checkpoint**: Foundation ready — Result type, all domain errors, and package configs are in place.

---

## Phase 3: User Story 3 — Define Value Objects (P1)

**Goal**: Strongly-typed value objects for core domain primitives. Each VO validates input at construction time.

**Independent Test**: Each value object accepts valid input and rejects invalid input on construction. Verify via `pnpm test --filter=domain`.

### Tests for Value Objects (TDD — write first, verify fail, then implement)

- [X] T021 [P] [US3] Write VO validation tests in `packages/domain/tests/value-objects/value-objects.test.ts` covering: UUID format for all ID VOs, email format, file path format, role values, project name rules, git provider values, mime type format, file node type values, content ID format, yjs state ID format, template category rules, date validation

### Implementation for Value Objects

- [X] T022 [P] [US3] Create UUID-based VOs in `packages/domain/src/value-objects/`: `user-id.ts`, `project-id.ts`, `file-node-id.ts`, `document-id.ts`, `git-repository-id.ts`, `template-id.ts`, `image-id.ts`, `audit-log-id.ts`, `content-id.ts`, `yjs-state-id.ts` — each wraps UUID string, validates format, implements equals()
- [X] T023 [P] [US3] Create string-based VOs: `email.ts` (RFC 5322, case-insensitive), `file-path.ts` (starts with `/`, no `..`), `project-name.ts` (non-empty, <=100 chars, no leading/trailing whitespace), `mime-type.ts`, `template-category.ts` (non-empty, <=50 chars)
- [X] T024 [P] [US3] Create enum VOs: `role.ts` (viewer, editor, administrator), `git-provider.ts` (github, gitlab, bitbucket), `file-node-type.ts` (file, folder)
- [X] T025 [US3] Create value objects barrel index in `packages/domain/src/value-objects/index.ts` re-exporting all 18 VOs

**Checkpoint**: All 18 VOs implemented and tested — `pnpm test --filter=domain` passes.

---

## Phase 4: User Story 2 — Define Core Domain Entities (P1)

**Goal**: Pure TypeScript domain entities with no external dependencies. Each entity validates invariants at domain boundaries.

**Independent Test**: Each entity can be instantiated and its invariants validated in a pure Node.js environment. Verify via `pnpm test --filter=domain`.

### Tests for Domain Entities (TDD — write first, verify fail, then implement)

- [X] T026 [P] [US2] Write User entity test in `packages/domain/tests/entities/user.test.ts`: valid instantiation, null passwordHash + null samlSubject rejected, invariant validation
- [X] T027 [P] [US2] Write Project entity test in `packages/domain/tests/entities/project.test.ts`: creation with name and owner, rootFolderId lifecycle, ownerId must have corresponding ProjectMember with admin role
- [X] T028 [P] [US2] Write remaining entity tests in `packages/domain/tests/entities/`: `project-member.test.ts` (role enum, composite key uniqueness), `file-node.test.ts` (type, parentId rules, root folder), `document.test.ts` (mimeType, unique fileNodeId), `git-repository.test.ts` (unique per project), `image.test.ts` (version chain), `template.test.ts`, `audit-log.test.ts`

### Implementation for Domain Entities

- [X] T029 [P] [US2] Create `User` entity in `packages/domain/src/entities/user.ts` with fields: id (UserId), email (Email), displayName, passwordHash|null, samlSubject|null, mfaSecret|null, createdAt (Date), updatedAt (Date). Invariants: at least one of passwordHash or samlSubject present, createdAt <= updatedAt
- [X] T030 [P] [US2] Create `Project` entity in `packages/domain/src/entities/project.ts` with fields: id, name (ProjectName), description|null, ownerId (UserId), tags (unique, max 10), rootFolderId (FileNodeId, set during creation use case), createdAt, updatedAt, archivedAt|null. Invariants: name not empty, ownerId must have ProjectMember with admin role, archivedAt set-once
- [X] T031 [P] [US2] Create `ProjectMember` entity in `packages/domain/src/entities/project-member.ts` with composite key (projectId, userId), role (Role), joinedAt (Date). Invariant: unique (projectId, userId)
- [X] T032 [P] [US2] Create `FileNode` entity in `packages/domain/src/entities/file-node.ts` with fields: id, projectId, parentId|null, name, type (FileNodeType), path (FilePath), createdAt, updatedAt. Invariants: root folder has parentId=null, non-root parentId non-null and references folder, name unique within parent
- [X] T033 [P] [US2] Create `Document` entity in `packages/domain/src/entities/document.ts` with fields: id, fileNodeId (unique), contentId (ContentId), yjsStateId (YjsStateId), mimeType (MimeType). Invariant: distinct contentId and yjsStateId
- [X] T034 [P] [US2] Create remaining entities: `git-repository.ts` (unique per project, createdAt), `image.ts` (project-level, version chain via parentId, sizeBytes>0, uploadedAt, updatedAt), `template.ts` (optional sourceProjectId, TemplateCategory), `audit-log.ts` (userId, optional projectId, action, resourceType, resourceId, timestamp, metadata)
- [X] T035 [US2] Create entities barrel index in `packages/domain/src/entities/index.ts` re-exporting all 9 entities

**Checkpoint**: All 9 entities implemented and tested — `pnpm test --filter=domain` passes.

---

## Phase 5: User Story 4 — Define Repository Interfaces (P1)

**Goal**: TypeScript repository interfaces in the domain layer so use cases depend on abstractions, not concrete implementations.

**Independent Test**: Each repository interface defines full CRUD and query methods. An in-memory fake can implement the interface without a database.

- [X] T036 [P] [US4] Create `ProjectRepository` interface in `packages/domain/src/repositories/project.repository.ts` with methods: findById(id), findByOwnerId(ownerId), save(project), delete(id)
- [X] T037 [P] [US4] Create `UserRepository` interface in `packages/domain/src/repositories/user.repository.ts` with methods: findById(id), findByEmail(email), save(user)
- [X] T038 [P] [US4] Create `FileNodeRepository` interface in `packages/domain/src/repositories/file-node.repository.ts` with methods: findById(id), findByParentId(parentId), findByProjectId(projectId), save(fileNode), move(id, newParentId), delete(id)
- [X] T039 [P] [US4] Create `DocumentRepository` interface in `packages/domain/src/repositories/document.repository.ts` with methods: findById(id), findByFileNodeId(fileNodeId), save(document), delete(id)
- [X] T040 [P] [US4] Create `ProjectMemberRepository` interface in `packages/domain/src/repositories/project-member.repository.ts` with methods: findByProjectId(projectId), findByUserId(userId), findByCompositeKey(projectId, userId), addMember(member), removeMember(projectId, userId), updateRole(projectId, userId, newRole)
- [X] T041 [P] [US4] Create remaining repository interfaces: `GitRepositoryRepository` (findByProjectId, save, delete), `TemplateRepository` (findById, save, delete, findAll), `ImageRepository` (findById, findByProjectId, save, delete), `AuditLogRepository` (save, findByProjectId, findByUserId, findAll)
- [X] T042 [US4] Create repositories barrel index in `packages/domain/src/repositories/index.ts` re-exporting all 9 interfaces

**Checkpoint**: All 9 repository interfaces defined — interfaces only, no implementations yet.

---

## Phase 6: User Story 6 — In-Memory Fake Repositories (P2)

**Goal**: In-memory implementations of all repository interfaces so use cases can be tested without infrastructure.

**Independent Test**: An in-memory fake passes the same contract tests that the real infrastructure implementation will later be tested against.

### Implementation for In-Memory Fakes

- [X] T043 [P] [US6] Create in-memory `InMemoryProjectRepository` in `packages/domain/tests/repositories/in-memory-project.repository.ts` implementing ProjectRepository with Map storage, findByOwnerId, save, delete
- [X] T044 [P] [US6] Create in-memory `InMemoryUserRepository` in `packages/domain/tests/repositories/in-memory-user.repository.ts` with Map storage, case-insensitive findByEmail, save
- [X] T045 [P] [US6] Create in-memory `InMemoryFileNodeRepository` in `packages/domain/tests/repositories/in-memory-file-node.repository.ts` with Map storage, findByParentId, findByProjectId, move (updates parentId), delete (cascades if folder)
- [X] T046 [P] [US6] Create in-memory `InMemoryDocumentRepository` in `packages/domain/tests/repositories/in-memory-document.repository.ts` with Map storage, findByFileNodeId
- [X] T047 [P] [US6] Create in-memory `InMemoryProjectMemberRepository` in `packages/domain/tests/repositories/in-memory-project-member.repository.ts` with Map storage keyed by composite key, findByProjectId, findByUserId, addMember, removeMember, updateRole
- [X] T048 [P] [US6] Create remaining in-memory fakes: `InMemoryGitRepositoryRepository`, `InMemoryTemplateRepository`, `InMemoryImageRepository`, `InMemoryAuditLogRepository`
- [X] T049 [US6] Create in-memory fakes barrel index in `packages/domain/tests/repositories/index.ts` re-exporting all 9 fakes

### Tests for In-Memory Repository Fakes

- [X] T050 [P] [US6] Write contract tests for all 9 in-memory fakes in `packages/domain/tests/repositories/`: test save + retrieval, findById, edge cases (empty results, not-found errors)

**Checkpoint**: All 9 in-memory fakes implemented and contract-tested — `pnpm test --filter=domain` passes.

---

## Phase 7: User Story 5 — Implement Core Use Cases (P1)

**Goal**: Domain use cases that encapsulate business logic. Each use case enforces domain invariants and returns `Result<T, DomainError>`.

**Independent Test**: Each use case can be tested against in-memory fake repositories and produce the expected results.

### Tests for Core Use Cases (TDD — write first, verify fail, then implement)

- [X] T051 [P] [US5] Write CreateProject use case test in `packages/domain/tests/use-cases/create-project.test.ts`: happy path (project + root folder + owner-as-admin + audit log created atomically), empty name rejected, duplicate email rejected
- [X] T052 [P] [US5] Write RenameFile use case test in `packages/domain/tests/use-cases/rename-file.test.ts`: valid rename with path update, unauthorized user rejected, non-existent file rejected, name conflict rejected, audit log created
- [X] T053 [P] [US5] Write DeleteFile use case test in `packages/domain/tests/use-cases/delete-file.test.ts`: delete file cascades document, delete folder cascades subtree, root folder deletion blocked, audit log created
- [X] T054 [P] [US5] Write InviteUser use case test in `packages/domain/tests/use-cases/invite-user.test.ts`: admin invites with role, viewer cannot invite, duplicate member rejected, user not found rejected, audit log created
- [X] T055 [P] [US5] Write RemoveMember use case test in `packages/domain/tests/use-cases/remove-member.test.ts`: remove non-owner member, owner cannot be removed (CannotRemoveOwnerError), last admin cannot be removed (CannotRemoveLastAdminError), audit log created
- [X] T056 [P] [US5] Write ChangeMemberRole use case test in `packages/domain/tests/use-cases/change-member-role.test.ts`: valid role change, owner's role cannot be changed (CannotChangeOwnerRoleError), last admin cannot be demoted (CannotRemoveLastAdminError), audit log created
- [X] T057 [P] [US5] Write GetProjectTree use case test in `packages/domain/tests/use-cases/get-project-tree.test.ts`: returns nested tree structure, non-existent project rejected, permissions enforced

### Implementation for Core Use Cases

- [X] T058 [US5] Implement `CreateProject` use case in `packages/domain/src/use-cases/create-project.ts`: validates ProjectName, creates Project (rootFolderId=null), creates root FileNode (type=folder, parentId=null), assigns rootFolderId, creates ProjectMember(owner, admin), creates AuditLog("project.created"), returns Result with projectId + rootFolderId + ownerId + ownerRole
- [X] T059 [US5] Implement `RenameFile` use case in `packages/domain/src/use-cases/rename-file.ts`: checks permission (actor must be project member), loads FileNode, validates new name uniqueness within parent, updates name and path, recursively updates descendant paths, creates AuditLog("file.renamed"), returns Result with fileNodeId + newName + newPath
- [X] T060 [US5] Implement `DeleteFile` use case in `packages/domain/src/use-cases/delete-file.ts`: checks permission, blocks root folder deletion, cascades delete (folder → descendants + documents, file → document), creates AuditLog("file.deleted"), returns Result
- [X] T061 [US5] Implement `InviteUser` use case in `packages/domain/src/use-cases/invite-user.ts`: checks caller is admin, finds user by email, validates not already member, creates ProjectMember, creates AuditLog("member.invited"), returns Result
- [X] T062 [US5] Implement `RemoveMember` use case in `packages/domain/src/use-cases/remove-member.ts`: checks caller is admin, rejects if target is owner (CannotRemoveOwnerError), rejects if target is last admin (CannotRemoveLastAdminError), removes member (preserving joinedAt for audit), creates AuditLog("member.removed"), returns Result
- [X] T063 [US5] Implement `ChangeMemberRole` use case in `packages/domain/src/use-cases/change-member-role.ts`: checks caller is admin, rejects if target is owner (CannotChangeOwnerRoleError), rejects if removing last admin (CannotRemoveLastAdminError), updates role, creates AuditLog("member.roleChanged"), returns Result
- [X] T064 [US5] Implement `GetProjectTree` use case in `packages/domain/src/use-cases/get-project-tree.ts`: checks caller is project member, loads all FileNodes for project, loads Documents for file nodes, builds nested tree structure (no audit log — read-only), returns Result with root FileTreeNode
- [X] T065 [US5] Create use cases barrel index in `packages/domain/src/use-cases/index.ts` re-exporting all 7 use cases

**Checkpoint**: All 7 use cases implemented and tested — `pnpm test --filter=domain` passes with all acceptance scenarios verified.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Workspace-level validation, coverage, and documentation.

- [X] T066 [P] Configure `onion.config.json` to enforce domain layer boundary (verify `packages/domain` imports nothing outside)
- [X] T067 [P] Configure Jest `coverageThreshold` at 90% for all packages, exempt domain package
- [X] T068 [P] Add fresh-onion validation to root `package.json` scripts (`pnpm fresh-onion`)
- [X] T069 Verify complete workspace: run `pnpm install`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test --filter=domain`, `pnpm test:coverage` — all pass with zero errors
- [X] T070 [P] Update `AGENTS.md` or README with build/test commands and architecture notes

**Checkpoint**: Full workspace validated — all gates pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US3 - Value Objects (Phase 3)**: Depends on Foundational — NO dependency on other user stories
- **US2 - Core Entities (Phase 4)**: Depends on US3 (entities use VOs)
- **US4 - Repository Interfaces (Phase 5)**: Depends on US2 (interfaces use entities)
- **US6 - In-Memory Fakes (Phase 6)**: Depends on US4 (fakes implement interfaces)
- **US5 - Core Use Cases (Phase 7)**: Depends on US4 + US6 (use cases use repos and fakes)
- **Polish (Phase 8)**: Depends on Phase 7 completion

### User Story Dependencies

```
US3 (VOs) → US2 (Entities) → US4 (Repo Interfaces) → US6 (Fakes) → US5 (Use Cases)
                                                                       ↑
                                                                 (uses fakes)
```

### Within Each User Story

- Tests (always included per TDD) MUST be written and FAIL before implementation
- Models before services
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] (T002-T008) can run in parallel
- All Foundational tasks marked [P] (T009-T016, T019) can run in parallel
- All VO tasks marked [P] (T021-T024) can run in parallel
- All entity tasks marked [P] (T026-T034) can run in parallel
- All repository tasks marked [P] (T036-T041) can run in parallel
- All fake tasks marked [P] (T043-T048, T050) can run in parallel
- All use case test tasks marked [P] (T051-T057) can run in parallel
- All polish tasks marked [P] (T066-T068, T070) can run in parallel

---

## Parallel Example: Phase 3 — Value Objects

```bash
# Tests for all VOs can be written in parallel:
Task: "Write VO validation tests in packages/domain/tests/value-objects/value-objects.test.ts"

# All 3 VO groups can be implemented in parallel:
Task: "Create UUID-based VOs (10 files) in packages/domain/src/value-objects/"
Task: "Create string-based VOs (5 files) in packages/domain/src/value-objects/"
Task: "Create enum VOs (3 files) in packages/domain/src/value-objects/"
```

## Parallel Example: Phase 7 — Core Use Cases

```bash
# All use case tests can be written in parallel (TDD red phase):
Task: "Write CreateProject test in packages/domain/tests/use-cases/create-project.test.ts"
Task: "Write RenameFile test in packages/domain/tests/use-cases/rename-file.test.ts"
Task: "Write DeleteFile test in packages/domain/tests/use-cases/delete-file.test.ts"
Task: "Write InviteUser test in packages/domain/tests/use-cases/invite-user.test.ts"
Task: "Write RemoveMember test in packages/domain/tests/use-cases/remove-member.test.ts"
Task: "Write ChangeMemberRole test in packages/domain/tests/use-cases/change-member-role.test.ts"
Task: "Write GetProjectTree test in packages/domain/tests/use-cases/get-project-tree.test.ts"

# After tests fail (red), implement use cases (in priority order):
Task: "Implement CreateProject use case in packages/domain/src/use-cases/create-project.ts"
Task: "Implement InviteUser use case in packages/domain/src/use-cases/invite-user.ts"
# ... continues for remaining 6 use cases
```

---

## Implementation Strategy

### MVP First (Phase 1–3 → Demo)

1. Complete Phase 1: Setup → `pnpm install` works
2. Complete Phase 2: Foundational → Errors + Result type ready
3. Complete Phase 3: US3 (VOs) → 18 typed VOs with tests passing
4. **STOP and VALIDATE**: `pnpm build --filter=domain && pnpm test --filter=domain` passes

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US3 (VOs) → Test independently
3. Add US2 (Entities) → Test independently
4. Add US4 (Repo Interfaces) → Design verified
5. Add US6 (In-Memory Fakes) → Infrastructure ready
6. Add US5 (Use Cases) → Fully functional domain layer
7. Polish → CI-ready workspace

### Parallel Team Strategy

With multiple developers:
1. Team completes Phase 1 + Phase 2 together
2. Developer A: US3 (VOs) + US2 (Entities) — 18 VOs + 9 entities
3. Developer B: US4 (Repo Interfaces) + US6 (In-Memory Fakes) — interfaces + implementations
4. Developer C: US5 (Use Cases) — 7 use cases with tests
5. All work integrates via shared error/result types from Foundational phase

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD red phase)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- All domain code: no decorators, no class-transformer, no class-validator, no DI framework
