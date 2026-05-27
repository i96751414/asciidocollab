---

description: "Task list for Phase 2 — Database Layer (Prisma schema + repository implementations)"
---

# Tasks: Database Layer

**Input**: Design documents from `specs/002-database-layer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — TDD is NON-NEGOTIABLE per constitution. Integration tests written first against real PostgreSQL via testcontainers.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold new packages and update root configs

- [x] T001 [P] Scaffold packages/db with package.json (@prisma/client, prisma devDep), tsconfig.json (composite, strict), and prisma/ directory
- [x] T002 [P] Scaffold packages/infrastructure with package.json (workspace deps: domain, db, @prisma/client; devDeps: jest, ts-jest, testcontainers), tsconfig.json (composite, strict, references domain+shared+db), and jest.config.ts (testcontainers-friendly)
- [x] T003 Update root tsconfig.json to add project references for packages/db and packages/infrastructure
- [x] T004 Update onion.config.json with db layer (packages/db/src) and infrastructure layer (packages/infrastructure/src); add allowed imports rules: db imports nothing, infrastructure imports domain+shared+db; keep existing domain→shared rule unchanged (domain MUST NOT import db or infrastructure per constitution I)
- [x] T005 [P] Install all dependencies via pnpm install at repo root

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Prisma schema, client generation, and test infrastructure — MUST complete before any user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Create Prisma schema at packages/db/prisma/schema.prisma with all 9 tables (User, Project, ProjectMember, FileNode, Document, Image, Template, GitRepository, AuditLog), 3 enums (Role, FileNodeType, GitProvider), FK relationships with cascade rules, indexes per data-model.md (FileNode: @@index([projectId], [parentId]); Image: @@index([projectId]); AuditLog: @@index([projectId], [userId])), and @db.Uuid on all UUID columns per plan.md constraint
- [x] T007 Setup Prisma client generation and re-export PrismaClient from packages/db/src/index.ts; add prisma generate to db build script
- [x] T008 Create testcontainers helper at packages/infrastructure/tests/helpers/prisma-test-container.ts — spins up postgres:16-alpine, runs migration (push), exposes PrismaClient instance
- [x] T009 Create test data factories at packages/infrastructure/tests/helpers/test-data.ts — factory functions for all 9 entities matching domain entity constructors

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Basic CRUD for Core Entities (Priority: P1) 🎯 MVP

**Goal**: Implement and test User, Project, and Template repositories (independent entities + FK to User)

**Independent Test**: Each repository test suite runs against a real PostgreSQL database via testcontainers, verifying save → findById → save (update) → delete → findById returns null

### Implementation for User Story 1

- [x] T010 [P] [US1] Write integration test for PrismaUserRepository at packages/infrastructure/tests/persistence/prisma-user.repository.test.ts — covers findById, findByEmail, save (create + update), null field handling (passwordHash/samlSubject/mfaSecret), query non-existent ID returns null (red→green: confirm test fails before implementation)
- [x] T011 [P] [US1] Write integration test for PrismaProjectRepository at packages/infrastructure/tests/persistence/prisma-project.repository.test.ts — covers findById, findByOwnerId, save (create + update), delete, tags JSON mapping, archivedAt handling, delete non-existent entity (handles gracefully) (red→green: confirm test fails before implementation)
- [x] T012 [P] [US1] Write integration test for PrismaTemplateRepository at packages/infrastructure/tests/persistence/prisma-template.repository.test.ts — covers findById, save, delete, findAll, nullable sourceProjectId, query non-existent ID returns null (red→green: confirm test fails before implementation)
- [x] T013 [US1] Implement PrismaUserRepository at packages/infrastructure/src/persistence/prisma-user.repository.ts — toDomain/toPersistence mapping for User entity, email uniqueness
- [x] T014 [US1] Implement PrismaProjectRepository at packages/infrastructure/src/persistence/prisma-project.repository.ts — toDomain/toPersistence mapping for Project entity (tags as JSON, ownerId FK)
- [x] T015 [US1] Implement PrismaTemplateRepository at packages/infrastructure/src/persistence/prisma-template.repository.ts — toDomain/toPersistence mapping for Template entity (sourceProjectId nullable FK)

**Checkpoint**: User Story 1 should be fully functional — users, projects, and templates persist and retrieve correctly

---

## Phase 4: User Story 2 — File Tree Operations (Priority: P1)

**Goal**: FileNode repository with self-referencing FK, parent-child queries, move, and cascade delete; Document one-to-one with FileNode

**Independent Test**: Create folder/file hierarchy, verify findByParentId, move node to new parent, delete folder cascades to children, Document CRUD via fileNodeId

### Implementation for User Story 2

- [x] T016 [P] [US2] Write integration test for PrismaFileNodeRepository at packages/infrastructure/tests/persistence/prisma-file-node.repository.test.ts — covers findById, findByParentId, findByProjectId, save, move (reparent), delete (cascade), invariant: root nodes must be folders, delete non-existent node (red→green: confirm test fails before implementation)
- [x] T017 [P] [US2] Write integration test for PrismaDocumentRepository at packages/infrastructure/tests/persistence/prisma-document.repository.test.ts — covers findById, findByFileNodeId, findByFileNodeIds, save, delete, contentId≠yjsStateId invariant, query non-existent ID returns null (red→green: confirm test fails before implementation)
- [x] T018 [US2] Implement PrismaFileNodeRepository at packages/infrastructure/src/persistence/prisma-file-node.repository.ts — toDomain/toPersistence mapping, recursive move via parentId update, cascade delete via Prisma onDelete: Cascade
- [x] T019 [US2] Implement PrismaDocumentRepository at packages/infrastructure/src/persistence/prisma-document.repository.ts — toDomain/toPersistence mapping for Document entity (unique fileNodeId FK, contentId/yjsStateId as UUIDs)

**Checkpoint**: File tree operations work correctly — create, move, delete with cascade

---

## Phase 5: User Story 3 — Role and Member Management (Priority: P1)

**Goal**: ProjectMember repository with composite primary key, role queries, and membership lifecycle

**Independent Test**: Create project with multiple members, query by project/user/composite key, update role, remove member

### Implementation for User Story 3

- [x] T020 [P] [US3] Write integration test for PrismaProjectMemberRepository at packages/infrastructure/tests/persistence/prisma-project-member.repository.test.ts — covers findByProjectId, findByUserId, findByCompositeKey, addMember, removeMember, updateRole, query non-existent composite key returns null (red→green: confirm test fails before implementation)
- [x] T021 [US3] Implement PrismaProjectMemberRepository at packages/infrastructure/src/persistence/prisma-project-member.repository.ts — toDomain/toPersistence mapping, composite PK (projectId + userId), Role enum mapping via PrismaEnum

**Checkpoint**: Role and member management queries work correctly

---

## Phase 6: User Story 4 — Git Repository Lookups (Priority: P2)

**Goal**: GitRepository repository with one-to-one lookup by projectId

**Independent Test**: Create git repo linked to project, query by projectId, query by id, delete

### Implementation for User Story 4

- [x] T022 [P] [US4] Write integration test for PrismaGitRepositoryRepository at packages/infrastructure/tests/persistence/prisma-git-repository.repository.test.ts — covers findById, findByProjectId, save, delete, GitProvider enum mapping, query non-existent projectId returns null (red→green: confirm test fails before implementation)
- [x] T023 [US4] Implement PrismaGitRepositoryRepository at packages/infrastructure/src/persistence/prisma-git-repository.repository.ts — toDomain/toPersistence mapping, unique projectId FK, GitProvider enum via PrismaEnum

**Checkpoint**: Git repository lookups work correctly

---

## Phase 7: User Story 5 — Audit Log and Image Filtering (Priority: P2)

**Goal**: AuditLog filtering by project/user, Image metadata persistence and project queries

**Independent Test**: Create audit entries for different projects/users, verify filtering; create images for project, verify project queries

### Implementation for User Story 5

- [x] T024 [P] [US5] Write integration test for PrismaImageRepository at packages/infrastructure/tests/persistence/prisma-image.repository.test.ts — covers findById, findByProjectId, save, delete, parentId self-FK, sizeBytes>0 invariant, query non-existent ID returns null (red→green: confirm test fails before implementation)
- [x] T025 [P] [US5] Write integration test for PrismaAuditLogRepository at packages/infrastructure/tests/persistence/prisma-audit-log.repository.test.ts — covers save, findByProjectId, findByUserId, findAll, nullable projectId, JSON metadata mapping, edge cases: metadata as null/empty object, very long action/resourceType strings (red→green: confirm test fails before implementation)
- [x] T026 [US5] Implement PrismaImageRepository at packages/infrastructure/src/persistence/prisma-image.repository.ts — toDomain/toPersistence mapping for Image entity (projectId FK, parentId self-FK, mimeType as string)
- [x] T027 [US5] Implement PrismaAuditLogRepository at packages/infrastructure/src/persistence/prisma-audit-log.repository.ts — toDomain/toPersistence mapping for AuditLog entity (JSON metadata, nullable projectId FK)

**Checkpoint**: Audit log and image filtering work correctly

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verify monorepo integrity and quality gates

- [x] T028 [P] Run pnpm build across monorepo (packages/db: prisma generate + tsc; packages/infrastructure: tsc) — fix any compilation errors
- [x] T029 [P] Run pnpm fresh-onion — verify no architectural violations with new db and infrastructure layers
- [x] T030 [P] Run pnpm lint — fix any lint warnings in new packages
- [x] T031 Run full pnpm test — all integration tests pass against real PostgreSQL via testcontainers
- [x] T032 Run pnpm typecheck — zero type errors across monorepo
- [x] T033 [P] Enforce type safety: configure @typescript-eslint/no-explicit-any: error and @typescript-eslint/consistent-type-assertions (assertionStyle: never) — 9 `as` casts eliminated via typed helper functions, ternary expressions, and JSON.parse round-trip; 2 test helper violations exempted via ESLint overrides
- [x] T034 [P] Write cross-cutting type mapping verification test at packages/infrastructure/tests/persistence/type-mapping.test.ts — 13 tests covering all 9 entity types, all field varieties (UUIDs, dates, enums, nulls, JSON metadata), testing repository-level round-trip

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational completion
  - Phase 3 (US1): First user story — User, Project, Template basics
  - Phase 4 (US2): Independent of US1 — uses separate tables (FileNode, Document)
  - Phase 5 (US3): Depends on US1 data — needs User and Project records for FK
  - Phase 6 (US4): Depends on US1 — needs Project record for FK
  - Phase 7 (US5): Depends on US1 — needs User and Project records for FK
- **Polish (Phase 8)**: All phases complete

### User Story Dependencies

- **US1 (P1)**: No story dependencies — starts after Foundational
- **US2 (P1)**: No story dependencies — FileNode and Document are separate tables
- **US3 (P1)**: Depends on US1 (needs User + Project for FK constraints) — DO NOT start before US1 test data is reliable
- **US4 (P2)**: Depends on US1 (needs Project for FK)
- **US5 (P2)**: Depends on US1 (needs User + Project for FK)

### Within Each User Story

- Integration tests MUST be written and FAIL before implementation (TDD: constitution III)
- toDomain/toPersistence mapping methods before full CRUD operations
- Core CRUD (findById, save) before advanced queries (findByProjectId, etc.)

### Parallel Opportunities

- All Setup tasks T001–T005 marked [P] can run in parallel
- Foundational tasks T006–T009 are sequential (T007 depends on T006, T008/T009 depend on T007)
- Test tasks within a story (e.g., T010+T011+T012) marked [P] can run in parallel
- Implementation tasks within a story are sequential to test (test first, then implementation)
- US2 can start after Phase 2 even if US1 is in progress (no table overlap)
- US3, US4, US5 should wait until US1 is stable (FK dependencies)

---

## Implementation Strategy

### MVP Scope (Phase 3 Only — US1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User, Project, Template repositories
4. **STOP and VALIDATE**: Run integration tests for US1 independently
5. Deploy/demo if needed

### Full Delivery

1. Setup + Foundational → Foundation ready
2. US1: Basic CRUD (User, Project, Template)
3. US2: File tree (FileNode, Document)
4. US3: Role management (ProjectMember)
5. US4: Git repo config (GitRepository)
6. US5: Audit + media (AuditLog, Image)
7. Polish: Build, test, lint, typecheck, fresh-onion all pass

---

## Parallel Execution Examples

### User Story 1

```bash
# Launch all integration tests for US1 in parallel:
Task: "Write PrismaUserRepository test"
Task: "Write PrismaProjectRepository test"
Task: "Write PrismaTemplateRepository test"

# Implement repositories sequentially (each depends on its test):
Task: "Implement PrismaUserRepository"
Task: "Implement PrismaProjectRepository"
Task: "Implement PrismaTemplateRepository"
```

### User Story 2

```bash
# Launch both integration tests in parallel:
Task: "Write PrismaFileNodeRepository test"
Task: "Write PrismaDocumentRepository test"

# Implement repositories:
Task: "Implement PrismaFileNodeRepository"
Task: "Implement PrismaDocumentRepository"
```
