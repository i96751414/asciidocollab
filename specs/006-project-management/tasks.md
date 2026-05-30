# Tasks: Project Management

**Input**: Design documents from `/specs/006-project-management/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included per TDD workflow (Constitution requirement).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] [Layer] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- **[Layer]**: Architectural layer where implementation occurs
  - `[Domain]` - packages/domain (entities, use cases, repository interfaces)
  - `[Infrastructure]` - packages/infrastructure (Prisma repos, adapters)
  - `[Shared]` - packages/shared (DTOs, error types, value objects)
  - `[API]` - apps/api (Fastify routes, plugins, middleware)
  - `[Web]` - apps/web (Next.js pages, components, client logic)
  - `[Test]` - Test files (unit, integration, E2E)
- Include exact file paths in descriptions

## Path Conventions

- **Domain**: `packages/domain/src/`, `packages/domain/tests/`
- **Infrastructure**: `packages/infrastructure/src/`, `packages/infrastructure/tests/`
- **Shared**: `packages/shared/src/`
- **API**: `apps/api/src/`, `apps/api/tests/`
- **Web**: `apps/web/src/`, `apps/web/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 [Web] Initialize Next.js 14 App Router project in apps/web with TypeScript and Tailwind CSS
- [x] T002 [Web] Configure shadcn/ui + Radix UI component library in apps/web
- [x] T003 [P] [Web] Setup API client service layer in apps/web/src/lib/api.ts
- [x] T004 [P] [Shared] Configure Zod validation schemas in packages/shared/src/schemas/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 [Domain] Extend ProjectRepository interface with findByMemberId method in packages/domain/src/repositories/project.repository.ts
- [x] T006 [Domain] Extend ProjectRepository interface with archive/restore methods in packages/domain/src/repositories/project.repository.ts
- [x] T007 [Domain] Extend ProjectRepository interface with update method in packages/domain/src/repositories/project.repository.ts
- [x] T008 [Test] Update InMemoryProjectRepository to implement new methods in packages/domain/tests/repositories/in-memory-project.repository.ts
- [x] T009 [Infrastructure] Update PrismaProjectRepository to implement new methods in packages/infrastructure/src/repositories/prisma-project.repository.ts
- [x] T010 [Domain] Create ListUserProjectsUseCase in packages/domain/src/use-cases/list-user-projects.ts
- [x] T011 [Domain] Create UpdateProjectUseCase in packages/domain/src/use-cases/update-project.ts
- [x] T012 [Domain] Create ArchiveProjectUseCase in packages/domain/src/use-cases/archive-project.ts
- [x] T013 [Domain] Create RestoreProjectUseCase in packages/domain/src/use-cases/restore-project.ts
- [x] T014 [P] [Shared] Add new DTOs to packages/shared/src/dtos/ for list-user-projects, update-project, archive-project, restore-project
- [x] T015 [P] [Domain] Register new use cases in packages/domain/src/use-cases/index.ts
- [x] T016 [P] [Web] Setup dashboard layout with sidebar navigation in apps/web/src/app/(dashboard)/layout.tsx
- [x] T017 [P] [Web] Create auth middleware for protected routes in apps/web/src/middleware.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - View Project List (Priority: P1) 🎯 MVP

**Goal**: Users can see all their projects in a dashboard

**Independent Test**: Log in and view dashboard - project list displays with correct data

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T018 [P] [US1] [Test] Unit test for ListUserProjectsUseCase in packages/domain/tests/use-cases/list-user-projects.test.ts
- [ ] T019 [P] [US1] [Test] Integration test for GET /api/projects in apps/api/tests/routes/projects.test.ts

### Implementation for User Story 1

- [x] T020 [P] [US1] [Web] Create project list page in apps/web/src/app/(dashboard)/page.tsx
- [x] T021 [P] [US1] [Web] Create ProjectCard component in apps/web/src/components/project-card.tsx
- [x] T022 [P] [US1] [Web] Create EmptyState component in apps/web/src/components/empty-state.tsx
- [x] T023 [US1] [API] Implement GET /api/projects route in apps/api/src/routes/projects.ts
- [x] T024 [US1] [API] Wire ListUserProjectsUseCase to API route
- [ ] T025 [US1] [Web] Add pagination support to project list
- [ ] T026 [US1] [Web] Add role display to project cards

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Create New Project (Priority: P1)

**Goal**: Users can create new projects from the dashboard

**Independent Test**: Click "Create Project", fill form, submit - project appears in list

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T027 [P] [US2] [Test] Unit test for CreateProjectUseCase (already exists, verify coverage)
- [ ] T028 [P] [US2] [Test] Integration test for POST /api/projects in apps/api/tests/routes/projects.test.ts

### Implementation for User Story 2

- [x] T029 [P] [US2] [Web] Create project creation form component in apps/web/src/components/project-form.tsx
- [x] T030 [P] [US2] [Web] Create project creation page in apps/web/src/app/(dashboard)/projects/new/page.tsx
- [x] T031 [US2] [API] Implement POST /api/projects route in apps/api/src/routes/projects.ts
- [x] T032 [US2] [API] Wire CreateProjectUseCase to API route
- [x] T033 [US2] [Web] Add form validation with Zod schemas
- [x] T034 [US2] [Web] Add success/error feedback to form
- [x] T035 [US2] [Web] Redirect to project list after successful creation

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Edit Project Settings (Priority: P2)

**Goal**: Project administrators can update project details

**Independent Test**: Navigate to project settings, edit name/description/tags, save - changes persist

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T036 [P] [US3] [Test] Unit test for UpdateProjectUseCase in packages/domain/tests/use-cases/update-project.test.ts
- [ ] T037 [P] [US3] [Test] Integration test for PATCH /api/projects/:id in apps/api/tests/routes/projects.test.ts

### Implementation for User Story 3

- [x] T038 [P] [US3] [Web] Create project settings page in apps/web/src/app/(dashboard)/projects/[id]/settings/page.tsx
- [x] T039 [P] [US3] [Web] Create project settings form component in apps/web/src/components/project-settings-form.tsx
- [x] T040 [US3] [API] Implement PATCH /api/projects/:id route in apps/api/src/routes/projects.ts
- [x] T041 [US3] [API] Wire UpdateProjectUseCase to API route
- [x] T042 [US3] [API] Add permission checks using shared requireAdministrator() helper
- [x] T043 [US3] [Web] Add optimistic updates for better UX
- [x] T044 [US3] [Web] Add confirmation feedback

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: User Story 4 - Manage Project Members (Priority: P2)

**Goal**: Project administrators can invite, change roles, and remove members

**Independent Test**: Navigate to members page, invite user, change role, remove - all operations work

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T045 [P] [US4] [Test] Unit test for InviteUserUseCase (already exists, verify coverage)
- [ ] T046 [P] [US4] [Test] Unit test for ChangeMemberRoleUseCase (already exists, verify coverage)
- [ ] T047 [P] [US4] [Test] Unit test for RemoveMemberUseCase (already exists, verify coverage)
- [ ] T048 [P] [US4] [Test] Integration test for member management routes in apps/api/tests/routes/projects/members.test.ts

### Implementation for User Story 4

- [x] T049 [P] [US4] [Web] Create member management page in apps/web/src/app/(dashboard)/projects/[id]/members/page.tsx
- [x] T050 [P] [US4] [Web] Create member list component in apps/web/src/components/member-list.tsx
- [x] T051 [P] [US4] [Web] Create invite member form component in apps/web/src/components/invite-member-form.tsx
- [x] T052 [US4] [API] Implement GET /api/projects/:id/members route in apps/api/src/routes/projects/members.ts
- [x] T053 [US4] [API] Implement POST /api/projects/:id/members route in apps/api/src/routes/projects/members.ts
- [x] T054 [US4] [API] Implement PATCH /api/projects/:id/members/:userId route in apps/api/src/routes/projects/members.ts
- [x] T055 [US4] [API] Implement DELETE /api/projects/:id/members/:userId route in apps/api/src/routes/projects/members.ts
- [x] T056 [US4] [API] Wire InviteUserUseCase, ChangeMemberRoleUseCase, RemoveMemberUseCase to routes
- [x] T057 [US4] [API] Add permission checks using shared requireAdministrator() helper
- [x] T058 [US4] [Web] Add role change dropdown component
- [x] T059 [US4] [Web] Add remove member confirmation dialog

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: User Story 5 - Archive/Restore Project (Priority: P3)

**Goal**: Project owners can archive and restore projects

**Independent Test**: Archive a project - it disappears from list; restore it - it reappears

### Tests for User Story 5

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T060 [P] [US5] [Test] Unit test for ArchiveProjectUseCase in packages/domain/tests/use-cases/archive-project.test.ts
- [ ] T061 [P] [US5] [Test] Unit test for RestoreProjectUseCase in packages/domain/tests/use-cases/restore-project.test.ts
- [ ] T062 [P] [US5] [Test] Integration test for archive/restore routes in apps/api/tests/routes/projects.test.ts

### Implementation for User Story 5

- [x] T063 [P] [US5] [Web] Create archived projects page in apps/web/src/app/(dashboard)/archived/page.tsx
- [x] T064 [P] [US5] [Web] Create archive/restore button component in apps/web/src/components/archive-button.tsx
- [x] T065 [US5] [API] Implement POST /api/projects/:id/archive route in apps/api/src/routes/projects.ts
- [x] T066 [US5] [API] Implement POST /api/projects/:id/restore route in apps/api/src/routes/projects.ts
- [x] T067 [US5] [API] Wire ArchiveProjectUseCase and RestoreProjectUseCase to routes
- [x] T068 [US5] [API] Add permission checks (owner only)
- [x] T069 [US5] [Web] Add archived filter to project list
- [x] T070 [US5] [Web] Add confirmation dialogs for archive/restore

**Checkpoint**: All user stories should now be independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T071 [P] [Web] Add loading states and skeleton screens to all pages
- [x] T072 [P] [Web] Add error boundaries and fallback UI
- [ ] T073 [P] [Web] Add responsive design for mobile views
- [ ] T074 [P] [Web] Add keyboard navigation support
- [ ] T075 [P] [Web] Add aria labels for accessibility
- [ ] T076 [P] [API] Add audit logging to all project and member operations
- [ ] T077 [Test] Run quickstart.md validation
- [ ] T078 [Test] Code cleanup and refactoring
- [ ] T079 [Web] Performance optimization (lazy loading, code splitting)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel (both P1)
  - US3 and US4 can proceed in parallel (both P2)
  - US5 depends on US1 completion (needs project list to archive from)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - Depends on US1 completion

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Domain before Infrastructure before API before Web
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, US1 and US2 can start in parallel
- All tests for a user story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test for ListUserProjectsUseCase in packages/domain/tests/use-cases/list-user-projects.test.ts"
Task: "Integration test for GET /api/projects in apps/api/tests/routes/projects.test.ts"

# Launch all components for User Story 1 together:
Task: "Create project list page in apps/web/src/app/(dashboard)/page.tsx"
Task: "Create ProjectCard component in apps/web/src/components/project-card.tsx"
Task: "Create EmptyState component in apps/web/src/components/empty-state.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (View Project List)
4. Complete Phase 4: User Story 2 (Create New Project)
5. **STOP and VALIDATE**: Test User Stories 1 and 2 independently
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 + 2 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 3 → Test independently → Deploy/Demo
4. Add User Story 4 → Test independently → Deploy/Demo
5. Add User Story 5 → Test independently → Deploy/Demo
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 + 2 (P1 - MVP)
   - Developer B: User Story 3 + 4 (P2)
   - Developer C: User Story 5 (P3)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- [Layer] indicates architectural layer for implementation
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
