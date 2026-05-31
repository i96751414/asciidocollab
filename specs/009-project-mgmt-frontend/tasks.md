# Tasks: Project Management Frontend

**Input**: Design documents from `specs/009-project-mgmt-frontend/`

**Prerequisites**: plan.md ✓ spec.md ✓ research.md ✓ data-model.md ✓ contracts/ ✓ quickstart.md ✓

**Tests**: Included — required by the AsciiDoCollab Constitution (TDD, Red-Green-Refactor is NON-NEGOTIABLE).

**Organization**: Tasks are grouped by layer then user story. All `/speckit-analyze` findings have been incorporated (two rounds).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependency on incomplete tasks)
- **[Story]**: User story from spec.md (US1–US6)
- Exact file paths in all descriptions

---

## Phase 1: Setup — Database Migration

**Purpose**: Add `OWNER` to the Prisma `Role` enum. This unblocks every layer above.

**⚠️ CRITICAL**: Complete before any domain, shared, API, or frontend work begins.

- [ ] T001 Add `OWNER` to the `Role` enum in `packages/db/prisma/schema.prisma`
- [ ] T002 Create Prisma migration (`add_owner_role`) with backfill SQL that sets `role = OWNER` for each `ProjectMember` whose `userId` matches the parent `Project.ownerId` in `packages/db/prisma/migrations/`

**Checkpoint**: `pnpm --filter @asciidocollab/db prisma migrate dev` succeeds; existing project-creator rows show `OWNER` role.

---

## Phase 2: Foundational — Domain · Shared · API · Frontend Base

**Purpose**: Cross-cutting changes every user story depends on: CSRF replacement, server-side auth/access plumbing, ConfirmationDialog (shared by US3, US5, US6), domain changes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### CSRF — SameSite + Origin validation (replaces token system)

- [ ] T003 Write failing tests for the Origin check Fastify plugin — correct origin passes, wrong origin returns 403, missing origin returns 403 — in `apps/api/tests/plugins/origin-check.test.ts`
- [ ] T004 Create `apps/api/src/plugins/origin-check.ts` — a Fastify `preHandler` hook that validates `request.headers.origin === process.env.FRONTEND_URL` for all `POST`, `PATCH`, `PUT`, and `DELETE` requests, returning `403 FORBIDDEN_ORIGIN` on mismatch; register the plugin in `apps/api/src/index.ts`; add `FRONTEND_URL=http://localhost:3000` to `.env.example` with a comment noting the production value requirement
- [ ] T005 [P] Configure `sameSite: 'strict'` on the session cookie in the Fastify session plugin registration in `apps/api/src/index.ts`

### Domain — Role value object and error types

- [ ] T006 Write failing tests for the updated `Role` value object (accepts `'owner'`, rejects unknown values) in `packages/domain/tests/value-objects/role.test.ts`
- [ ] T007 Update `Role.create()` to accept `'owner'` as a valid value in `packages/domain/src/value-objects/role.ts`
- [ ] T008 [P] Create `CannotRemoveLastOwnerError` in `packages/domain/src/errors/cannot-remove-last-owner.ts` and export from `packages/domain/src/errors/index.ts`

### Domain — Repository interface extensions

- [ ] T009 Add `delete(projectId: ProjectId): Promise<void>` to the `ProjectRepository` interface in `packages/domain/src/repositories/project.repository.ts`
- [ ] T010 [P] Add `search(query: string, excludeProjectId?: ProjectId): Promise<User[]>` to the `UserRepository` interface in `packages/domain/src/repositories/user.repository.ts`

### Domain — In-memory fake updates (must complete before use-case tests compile)

- [ ] T011 Update the `InMemoryProjectRepository` test fake with a `delete()` implementation in the domain test helpers
- [ ] T012 [P] Update the `InMemoryUserRepository` test fake with a `search()` implementation in the domain test helpers

### Infrastructure — Repository implementations

- [ ] T013 Implement `ProjectRepository.delete()` using Prisma `project.delete` in `packages/infrastructure/src/repositories/project.repository.ts`
- [ ] T014 [P] Implement `UserRepository.search()` using Prisma `user.findMany` with case-insensitive match on `displayName` and `email`, excluding members of `excludeProjectId` when provided, in `packages/infrastructure/src/repositories/user.repository.ts`

### Domain — Use case updates and new use case

- [ ] T015 Write failing tests for the updated `ChangeMemberRoleUseCase` — owner callers can change any role; administrators cannot assign/change `owner`; last-owner demotion returns `CannotRemoveLastOwnerError`; use in-memory fakes in `packages/domain/tests/use-cases/change-member-role.test.ts`
- [ ] T016 Update `ChangeMemberRoleUseCase` — allow `owner` OR `administrator` callers; only `owner` callers may assign or demote the `owner` role; enforce last-owner invariant in `packages/domain/src/use-cases/change-member-role.ts`
- [ ] T017 [P] Write failing tests for the updated `RemoveMemberUseCase` — owner callers can remove non-last-owner members; blocking removal of the last owner returns `CannotRemoveLastOwnerError`; use in-memory fakes in `packages/domain/tests/use-cases/remove-member.test.ts`
- [ ] T018 [P] Update `RemoveMemberUseCase` — allow `owner` OR `administrator` callers; replace `project.ownerId.equals(targetUserId)` check with owner-role count; return `CannotRemoveLastOwnerError` when target is last owner in `packages/domain/src/use-cases/remove-member.ts`
- [ ] T019 Write failing tests for `DeleteProjectUseCase` — owner succeeds, non-owner returns `PermissionDeniedError`, unknown project returns `ProjectNotFoundError`; use in-memory fakes in `packages/domain/tests/use-cases/delete-project.test.ts`
- [ ] T020 Implement `DeleteProjectUseCase` — owner-only guard → write audit log entry (`project.deleted`) → `projectRepo.delete()`; export from `packages/domain/src/use-cases/index.ts` in `packages/domain/src/use-cases/delete-project.ts`

### Shared package — Types and schemas

- [ ] T021 [P] Add `"owner"` to both `inviteMemberSchema` and `updateMemberRoleSchema` role enums in `packages/shared/src/schemas/project.ts`
- [ ] T022 [P] Create `UserSearchResultDto` interface in `packages/shared/src/dtos/user-search.dto.ts` and export from `packages/shared/src/dtos/index.ts`
- [ ] T023 [P] Update `ProjectDto.role` and `ProjectMember.role` union types to include `'owner'` in `packages/shared/src/dtos/project-management.dto.ts`

### API layer — New and updated routes

- [ ] T024 Write failing integration test for `DELETE /api/projects/:id` (owner succeeds 200, non-owner 403, unknown 404) in `apps/api/tests/routes/projects.delete.test.ts`
- [ ] T025 Add `DELETE /api/projects/:id` route delegating to `DeleteProjectUseCase` in `apps/api/src/routes/projects.ts`
- [ ] T026 [P] Write failing integration test for `GET /api/users/search?q=...&excludeProjectId=...` (results exclude project members, max 10 returned) in `apps/api/tests/routes/users-search.test.ts`
- [ ] T027 [P] Create `GET /api/users/search` route in `apps/api/src/routes/projects/users-search.ts`; register it in `apps/api/src/index.ts`
- [ ] T028 Update `POST /api/projects/:id/members` and `PATCH /api/projects/:id/members/:userId` Fastify schemas to accept `"owner"` in the `role` enum in `apps/api/src/routes/projects/members.ts`

### Frontend — api.ts, server-side access helper, auth middleware, 403 page, and CurrentUser context

- [ ] T029 Update `apps/web/src/lib/api.ts` — add `'owner'` to all role type unions; remove ALL `getCsrfToken()` calls from every method in `authApi`, `projectsApi`, and `membersApi` (SameSite+Origin approach covers the full API surface); add `projectsApi.delete(id)`; add `usersApi.search(query, excludeProjectId?)`
- [ ] T030 Create `apps/web/src/app/403/page.tsx` — a static "Not Authorised" server component page with an explanatory message and a link back to `/dashboard`
- [ ] T031 Create `apps/web/src/middleware.ts` — Next.js Edge middleware that checks for the presence of the session cookie only; if absent, redirect to `/login`; no project-role check (Edge runtime cannot query PostgreSQL)
- [ ] T032 Create `apps/web/src/lib/get-project-access.ts` — a server-side async helper that calls `GET /api/projects/:id/members` and `GET /auth/me` with the forwarded session cookie, resolves the current user's `ProjectMemberRole` for the project, and calls `redirect('/403')` if the role does not meet the required minimum; used by settings and members server-component pages
- [ ] T033 [P] Create `CurrentUserContext` and `CurrentUserProvider` in `apps/web/src/contexts/current-user-context.tsx`
- [ ] T034 [P] Create `useCurrentUser()` hook consuming `CurrentUserContext` in `apps/web/src/hooks/use-current-user.ts`
- [ ] T035 [P] Update `apps/web/src/app/(dashboard)/layout.tsx` to fetch current user via `authApi.me()` server-side and wrap children in `CurrentUserProvider`

### Frontend — ConfirmationDialog (Foundational — required by US3, US5, US6)

- [ ] T036 Write failing tests for `ConfirmationDialog` — renders title/description, confirm triggers `onConfirm`, cancel closes without triggering in `apps/web/tests/components/confirmation-dialog.test.tsx`
- [ ] T037 Install shadcn AlertDialog component: `pnpm dlx shadcn@latest add alert-dialog` to generate `apps/web/src/components/ui/alert-dialog.tsx`
- [ ] T038 Create `ConfirmationDialog` component wrapping shadcn `AlertDialog` in `apps/web/src/components/confirmation-dialog.tsx`

**Checkpoint**: `pnpm typecheck` green. Domain tests pass. Origin-check plugin rejects wrong-origin requests. Session cookie has `SameSite=Strict`. `/403` page renders. Middleware redirects unauthenticated requests to `/login`.

---

## Phase 3: User Story 1 — Dashboard (Priority: P1) 🎯 MVP

**Goal**: Signed-in users see all their projects with role badges and a settings link on admin/owner cards. Active projects shown by default; an archived-view link exists.

**Independent Test**: Log in → dashboard shows role badges; settings link visible for administrator/owner only; viewer/editor cards have no settings link; "Archived projects" link present.

### Tests

- [ ] T039 Write failing tests for the updated `ProjectCard` — settings link renders for `administrator` and `owner`, absent for `viewer` and `editor` in `apps/web/tests/components/project-card.test.tsx`
- [ ] T040 [P] Write failing tests for the updated `DashboardPage` — "Create Project" button always visible, archived toggle link present in `apps/web/tests/app/(dashboard)/dashboard/page.test.tsx`

### Implementation

- [ ] T041 [US1] Update `ProjectCard` to render a settings link when `project.role === 'administrator' || project.role === 'owner'` in `apps/web/src/components/project-card.tsx`
- [ ] T042 [US1] Update `DashboardPage` to always show a "New Project" button in the header and add a link to `/dashboard/archived` when projects exist in `apps/web/src/app/(dashboard)/dashboard/page.tsx`

**Checkpoint**: Dashboard is role-aware with persistent navigation.

---

## Phase 4: User Story 2 — Project Settings (Priority: P1)

**Goal**: Administrators and owners edit project settings. Viewers/editors are blocked server-side before the page renders. Archived projects show all fields disabled with a banner.

**Independent Test**: As owner, open settings → edit name → success notice. As viewer, navigate to the same URL → middleware redirects to `/login` if unauthenticated; if authenticated as viewer, server component redirects to `/403` before rendering.

### Tests

- [ ] T043 Write failing tests for the updated `ProjectSettingsForm` — inputs disabled when `isArchived=true`; archive banner visible; save button hidden when `isArchived=true` in `apps/web/tests/components/project-settings-form.test.tsx`
- [ ] T044 [P] Write failing tests for `ProjectSettingsPage` (server component) — calls `getProjectAccess`; renders client component with correct props; redirects when role is insufficient in `apps/web/tests/app/(dashboard)/dashboard/projects/[id]/settings/page.test.tsx`

### Implementation

- [ ] T045 [US2] Update `ProjectSettingsForm` to accept `isArchived: boolean` and `currentUserRole: ProjectMemberRole` props; disable all inputs and hide submit when `isArchived=true`; render a prominent archive `Alert` banner when `isArchived=true` in `apps/web/src/components/project-settings-form.tsx`
- [ ] T046 [US2] Convert `ProjectSettingsPage` to an `async` server component: call `getProjectAccess(id, minRole: 'administrator')` (redirects to `/403` automatically if role is insufficient); pass `project`, `isArchived`, and `currentUserRole` as props to `SettingsClient` in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/settings/page.tsx`
- [ ] T047 [US2] Create `SettingsClient` — extract the existing `"use client"` page logic (loading/error states, `ProjectSettingsForm`) into `apps/web/src/app/(dashboard)/dashboard/projects/[id]/settings/settings-client.tsx`; accepts `project`, `isArchived`, `currentUserRole` as props

**Checkpoint**: Settings page enforces role access server-side and disables correctly for archived projects.

---

## Phase 5: User Story 3 — Manage Project Members (Priority: P2)

**Goal**: Administrators and owners manage the member list with confirmation dialogs and sole-owner protection. Access blocked server-side.

**Independent Test**: As admin, open members tab → change role → remove with dialog. As sole owner → warning banner shown → remove-self blocked.

### Tests

- [ ] T048 [P] Write failing tests for `SoleOwnerWarning` — visible when `visible=true`, hidden when `visible=false` in `apps/web/tests/components/sole-owner-warning.test.tsx`
- [ ] T049 Write failing tests for the updated `MemberList` — `owner` option only in dropdown for owner callers; own-row dropdown disabled below `owner` when sole owner; remove triggers `ConfirmationDialog` not `window.confirm`; errors displayed on failure in `apps/web/tests/components/member-list.test.tsx`
- [ ] T050 [P] Write failing tests for `ProjectMembersPage` (server component) — calls `getProjectAccess`; renders `MembersClient` with correct props; redirects on insufficient role in `apps/web/tests/app/(dashboard)/dashboard/projects/[id]/members/page.test.tsx`

### Implementation

- [ ] T051 [P] [US3] Create `SoleOwnerWarning` component (destructive `Alert` banner) in `apps/web/src/components/sole-owner-warning.tsx`
- [ ] T052 [US3] Update `MemberList` — add `currentUserId` and `currentUserRole` props; show `owner` in role dropdown only when caller is owner; disable own-row dropdown options below `owner` when sole owner (tooltip explanation); replace `window.confirm()` with `ConfirmationDialog`; display errors on failure in `apps/web/src/components/member-list.tsx`
- [ ] T053 [US3] Convert `ProjectMembersPage` to an `async` server component: call `getProjectAccess(id, minRole: 'administrator')`; pass `members`, `currentUserId`, and `currentUserRole` to `MembersClient` in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/members/page.tsx`
- [ ] T054 [US3] Create `MembersClient` — extract the existing `"use client"` page logic (`MemberList`, `InviteMemberForm`, `SoleOwnerWarning`) into `apps/web/src/app/(dashboard)/dashboard/projects/[id]/members/members-client.tsx`; accepts `members`, `currentUserId`, `currentUserRole` as props

**Checkpoint**: Members page enforces sole-owner protection and role access server-side; all destructive actions use dialog confirmation.

---

## Phase 6: User Story 4 — Invite Members with Autocomplete (Priority: P2)

**Goal**: Administrators and owners invite members via a search autocomplete showing only registered non-members.

**Independent Test**: Type partial name → dropdown shows registered non-members. Select a user, choose a role, submit → user appears in member list.

### Tests

- [ ] T055 Write failing tests for `UserSearchCombobox` — dropdown renders after typing ≥2 chars; "No users found" when API returns empty; calls `onChange` with selected user; passes `projectId` as `excludeProjectId` in `apps/web/tests/components/user-search-combobox.test.tsx`
- [ ] T056 [P] Write failing tests for the updated `InviteMemberForm` — renders `UserSearchCombobox` instead of email input; submit disabled when no user selected; `owner` role option visible only when `currentUserRole === 'owner'`; resets on success in `apps/web/tests/components/invite-member-form.test.tsx`

### Implementation

- [ ] T057 [US4] Create `UserSearchCombobox` — debounced input (300 ms) calling `usersApi.search()`; dropdown of results; "No users found" empty state; clears on reset in `apps/web/src/components/user-search-combobox.tsx`
- [ ] T058 [US4] Update `InviteMemberForm` — replace email `<Input>` with `UserSearchCombobox`; submit the selected user's email to the existing invite endpoint; show `owner` in the role `<select>` only when `currentUserRole === 'owner'` in `apps/web/src/components/invite-member-form.tsx`

**Checkpoint**: Invite flow fully autocomplete-driven; unregistered addresses unreachable; owner role option visible to owners only.

---

## Phase 7: User Story 5 — Archive and Restore (Priority: P3)

**Goal**: Owners archive and restore projects via settings with confirmation dialogs. Archived projects are read-only in both settings and the members page.

**Independent Test**: As owner, archive from settings → `ConfirmationDialog` appears → project moves to archived list. Open archived settings → banner + all fields disabled. Open archived members page → all actions disabled. Click Restore → project returns to active list.

### Tests

- [ ] T059 Write failing tests for the updated `ArchiveButton` — uses `ConfirmationDialog` instead of `window.confirm`; displays error notification on API failure in `apps/web/tests/components/archive-button.test.tsx`
- [ ] T060 [P] Write failing tests for the archived-state guard on `MembersClient` — all member actions disabled and invite form hidden when `isArchived=true` in `apps/web/tests/app/(dashboard)/dashboard/projects/[id]/members/members-client.test.tsx`

### Implementation

- [ ] T061 [US5] Update `ArchiveButton` — replace `window.confirm()` with `ConfirmationDialog`; add error notification on API failure; accept `projectName` prop for dialog description in `apps/web/src/components/archive-button.tsx`
- [ ] T062 [US5] Update `MembersClient` to accept `isArchived: boolean`; when `true`, disable all role dropdowns and remove buttons, hide the invite form, and show the archive banner in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/members/members-client.tsx`

**Checkpoint**: Archive/restore uses proper dialogs; archived projects are fully read-only in both the settings and members pages.

---

## Phase 8: User Story 6 — Delete Project (Priority: P3)

**Goal**: Owners permanently delete a project via a typed-name confirmation. On success, redirected to dashboard with a visible success toast.

**Independent Test**: As owner, click "Delete project" → dialog with typed-name input → Delete disabled until name matches. Confirm → redirected to dashboard with "Project deleted" toast. Visit old project URL → "project not found".

### Tests

- [ ] T063 Write failing tests for `DeleteProjectButton` — delete button disabled until typed value exactly matches `projectName`; on success calls `onDeleted`; not rendered when `currentUserRole !== 'owner'` in `apps/web/tests/components/delete-project-button.test.tsx`

### Implementation

- [ ] T064 Install shadcn toast (or sonner): `pnpm dlx shadcn@latest add sonner`; register `<Toaster />` in `apps/web/src/app/layout.tsx`
- [ ] T065 [US6] Create `DeleteProjectButton` — opens `AlertDialog` with typed-name input gating the confirm button (case-sensitive equality check); on confirm calls `projectsApi.delete(projectId)`; on success calls `onDeleted()` in `apps/web/src/components/delete-project-button.tsx`
- [ ] T066 [US6] Integrate `ArchiveButton` and `DeleteProjectButton` into `SettingsClient` — render both only when `currentUserRole === 'owner'`; wire `onDeleted` to `router.push('/dashboard?deleted=1')` in `apps/web/src/app/(dashboard)/dashboard/projects/[id]/settings/settings-client.tsx`; update `DashboardPage` to read the `deleted` query param on mount and fire a "Project deleted" toast in `apps/web/src/app/(dashboard)/dashboard/page.tsx`

**Checkpoint**: Complete project lifecycle — create, configure, archive, restore, delete — fully functional end-to-end with toast feedback.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: E2E coverage for critical flows and final quality sweep.

- [ ] T067 [P] Add Playwright E2E test for project settings — middleware auth redirect, server-component 403 redirect, settings update, archived-state disabling in `apps/web/e2e/project-settings.spec.ts`
- [ ] T068 [P] Add Playwright E2E test for member management — role change, member removal, sole-owner invariant, archived-state read-only in `apps/web/e2e/project-members.spec.ts`
- [ ] T069 [P] Add Playwright E2E test for project deletion — typed-name gate, redirect, dashboard success toast in `apps/web/e2e/project-delete.spec.ts`
- [ ] T070 [P] Add Playwright E2E test for archive and restore flow in `apps/web/e2e/project-archive.spec.ts`
- [ ] T071 Run `pnpm typecheck` and `pnpm lint` across all changed packages; resolve any remaining type errors or lint warnings

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies — start immediately
- **Phase 2**: Depends on Phase 1 — BLOCKS all user story phases
- **Phase 3 (US1)**: Depends on Phase 2 only
- **Phase 4 (US2)**: Depends on Phase 2; uses `getProjectAccess` (T032)
- **Phase 5 (US3)**: Depends on Phase 2; uses `ConfirmationDialog` (T038) and `getProjectAccess` (T032)
- **Phase 6 (US4)**: Depends on Phase 2 and Phase 5 (`MembersClient` now receives `currentUserRole`)
- **Phase 7 (US5)**: Depends on Phase 2, Phase 4 (`SettingsClient`), and Phase 5 (`MembersClient`); uses `ConfirmationDialog` (T038)
- **Phase 8 (US6)**: Depends on Phase 2, Phase 4 (`SettingsClient`), and T064 (toast install); uses `ConfirmationDialog` (T038)
- **Phase 9**: Depends on all desired stories

### Key dependency notes

- `ConfirmationDialog` (T038) is in Phase 2 — hard prerequisite for `ArchiveButton` (T061), `MemberList` (T052), and `DeleteProjectButton` (T065)
- `getProjectAccess` (T032) must exist before settings page (T046) and members page (T053) are written
- `SettingsClient` (T047) must exist before `ArchiveButton`/`DeleteProjectButton` integration (T066)
- `MembersClient` (T054) must exist before archived-state guard (T062)
- Toast install (T064) must precede dashboard toast wiring in T066
- All `getCsrfToken()` calls removed in T029 — auth routes and project/member routes both covered by SameSite+Origin

### Parallel Opportunities (within Phase 2)

```
T003 → T004 (Origin check test → impl)
T005 [P]                       (SameSite config: independent)
T006 → T007                    (Role VO: sequential)
T008 [P]                       (error type: independent)
T009, T010 [P]                 (repo interfaces: parallel)
T011, T012 [P]                 (in-memory fakes: parallel, after T009/T010)
T013, T014 [P]                 (infra repos: parallel, after T011/T012)
T015 → T016                    (ChangeMemberRole: sequential)
T017 → T018 [P with T015]      (RemoveMember: parallel stream)
T019 → T020 [P with T017]      (DeleteProject: parallel stream)
T021, T022, T023 [P]           (shared types: parallel)
T024 → T025 (DELETE route)
T026 → T027 [P with T024]      (search route: parallel)
T028 [P]                       (member schema: independent)
T029                           (api.ts: after T021–T023)
T030, T031, T032 [P]           (403 page, middleware, access helper: parallel)
T033, T034, T035 [P]           (context, hook, layout: parallel)
T036 → T037 → T038             (ConfirmationDialog: sequential)
```

---

## Parallel Execution Examples

### Phase 2 — Maximum Parallelism

```bash
# Stream 1: CSRF + SameSite
T003 → T004, T005 [P]

# Stream 2: Domain — Role VO + use cases
T006 → T007 → T015 → T016

# Stream 3: Parallel use case streams
T017 → T018  (after T007)
T019 → T020  (after T013/T014)

# Stream 4: Repository chain
T008, T009, T010 → T011, T012 → T013, T014

# Stream 5: Shared types (fully independent)
T021, T022, T023

# Stream 6: API routes (after T020)
T024 → T025, T026 → T027, T028

# Stream 7: Frontend base (after T021–T023)
T029, T030, T031, T032, T033, T034, T035

# Stream 8: ConfirmationDialog (parallel with stream 7)
T036 → T037 → T038
```

---

## Implementation Strategy

### MVP (US1 + US2 — Dashboard and Settings)

1. Phase 1 + 2 → Foundation, CSRF, server-side access, ConfirmationDialog
2. Phase 3 (US1) → Role-aware dashboard
3. Phase 4 (US2) → Server-component settings page + client extraction
4. **Validate**: settings page 403-guarded server-side; archived state disables correctly

### Full Incremental Delivery

1. Phase 1 + 2 → Foundation
2. Phase 3 (US1) → Dashboard
3. Phase 4 (US2) → Settings
4. Phase 5 (US3) → Members management + owner invariant
5. Phase 6 (US4) → Invite autocomplete
6. Phase 7 (US5) → Archive/restore
7. Phase 8 (US6) → Delete + toast
8. Phase 9 → E2E + quality sweep

---

## Notes

- `[P]` tasks operate on different files with no incomplete local dependencies
- `[Story]` label maps each task to a user story for traceability
- All test tasks MUST be confirmed failing (Red) before the paired implementation task (Green)
- `ConfirmationDialog` (T038) is in Phase 2 — never implement a destructive action before it is complete
- Next.js middleware (T031) handles authentication only — project-role checks belong in `getProjectAccess()` (T032), called from async server-component pages
- T029 removes ALL `getCsrfToken()` calls from `api.ts` (auth + project + member routes), since the Origin check plugin (T004) covers the full API surface
- Constitution §II (TDD): commit only after Green phase; never commit with failing tests
