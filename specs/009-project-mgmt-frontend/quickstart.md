# Quickstart: Project Management Frontend

**Feature**: `009-project-mgmt-frontend` | **Date**: 2026-05-31

## Implementation Order

Work must proceed bottom-up through the stack. Do not start a layer until the layer below it is green.

```
Layer 0: Database migration (Prisma)
  └── Layer 1: Domain (packages/domain)
        └── Layer 2: Shared types (packages/shared)
              └── Layer 3: API routes (apps/api)
                    └── Layer 4: Frontend (apps/web)
```

---

## Layer 0 — Database

**File**: `packages/db/prisma/schema.prisma`

Add `OWNER` to the `Role` enum:
```prisma
enum Role {
  VIEWER
  EDITOR
  ADMINISTRATOR
  OWNER          // ← add
}
```

Run:
```bash
pnpm --filter @asciidocollab/db prisma migrate dev --name add_owner_role
```

The migration SQL should include:
```sql
ALTER TYPE "Role" ADD VALUE 'OWNER';

-- Backfill: set existing project creators to OWNER role
UPDATE "ProjectMember" pm
SET role = 'OWNER'
FROM "Project" p
WHERE pm."projectId" = p.id
  AND pm."userId" = p."ownerId";
```

---

## Layer 1 — Domain

### 1a. `packages/domain/src/value-objects/role.ts`
Add `'owner'` to the valid values guard.

### 1b. `packages/domain/src/errors/cannot-remove-last-owner.ts`
New error, same shape as `CannotRemoveOwnerError`.

### 1c. `packages/domain/src/use-cases/change-member-role.ts`
- Caller check: allow `role.value === 'owner' || role.value === 'administrator'`
- Block changing an owner's role unless the caller is also an owner
- Block demoting the last owner: count members with `role.value === 'owner'`; if count would reach 0 → `CannotRemoveLastOwnerError`

### 1d. `packages/domain/src/use-cases/remove-member.ts`
- Caller check: allow `owner` or `administrator`
- Replace `project.ownerId.equals(targetUserId)` check with: count members with `role.value === 'owner'`; if target is owner AND count ≤ 1 → `CannotRemoveLastOwnerError`

### 1e. `packages/domain/src/use-cases/delete-project.ts` (new)
- Caller must have `owner` role
- Call `projectRepo.delete(projectId)`
- Prisma cascade handles members, files, folders

**TDD**: Write failing tests in `packages/domain/tests/` before each change.

---

## Layer 2 — Shared Package

**File**: `packages/shared/src/schemas/project.ts`

```typescript
// Both inviteMemberSchema and updateMemberRoleSchema:
role: z.enum(["viewer", "editor", "administrator", "owner"])
```

Add `UserSearchResultDto` to `packages/shared/src/dtos/user-search.dto.ts`:
```typescript
export interface UserSearchResultDto {
  userId: string;
  displayName: string;
  email: string;
}
```

Update `ProjectDto.role` and `ProjectMember.role` in `packages/shared/src/dtos/project-management.dto.ts` to include `'owner'`.

---

## Layer 3 — API

### 3a. Update `apps/api/src/routes/projects/members.ts`
- `POST` and `PATCH` schema: add `"owner"` to the `role` enum
- Ensure CSRF validation is active for both routes (check `apps/api/src/plugins/csrf.ts` is applied)

### 3b. Add `DELETE /api/projects/:id` to `apps/api/src/routes/projects.ts`
```typescript
app.delete("/api/projects/:id", ..., async (request, reply) => {
  const useCase = new DeleteProjectUseCase(repos.project, repos.projectMember, repos.auditLog);
  const result = await useCase.execute(UserId.create(sessionUserId), ProjectId.create(id));
  if (!result.success) { ... mapDomainError ... }
  return reply.status(200).send({ data: { id } });
});
```

### 3c. Add `apps/api/src/routes/projects/users-search.ts`
```
GET /api/users/search?q=<query>&excludeProjectId=<id>
```
- Require session
- Validate `q` min length 2
- Query `UserRepository.search(q, excludeProjectId?)` — add this method to the repository interface + infrastructure implementation
- Return `{ data: { users: UserSearchResultDto[] } }`

---

## Layer 4 — Frontend

### 4a. `apps/web/src/lib/api.ts`
1. Add `owner` to all role type unions
2. Add `getCsrfToken()` call to every mutating method that currently lacks it
3. Add `projectsApi.delete(id)`
4. Add `usersApi.search(query, excludeProjectId?)`

### 4b. `apps/web/src/contexts/current-user-context.tsx`
Create `CurrentUserContext` and `CurrentUserProvider`. Fetch in `layout.tsx`.

### 4c. New components (write test first for each)
- `components/ui/alert-dialog.tsx` — install via `pnpm dlx shadcn@latest add alert-dialog`
- `components/confirmation-dialog.tsx`
- `components/user-search-combobox.tsx`
- `components/delete-project-button.tsx`
- `components/sole-owner-warning.tsx`

### 4d. Updated components (write test first for each change)
- `components/member-list.tsx`
- `components/invite-member-form.tsx`
- `components/archive-button.tsx`
- `components/project-settings-form.tsx`
- `components/project-card.tsx`

### 4e. Updated pages
- `app/(dashboard)/layout.tsx` — provide `CurrentUserContext`
- `app/(dashboard)/dashboard/page.tsx` — always-visible "Create Project" button; settings link per role
- `app/(dashboard)/dashboard/projects/[id]/settings/page.tsx` — role guard (redirect viewers/editors); pass `isArchived` and `currentUserRole`
- `app/(dashboard)/dashboard/projects/[id]/members/page.tsx` — role guard; pass `currentUserId` and `currentUserRole` to components

---

## Running Tests

```bash
# Domain tests
pnpm --filter @asciidocollab/domain test

# Frontend unit/component tests
pnpm --filter @asciidocollab/web test

# E2E (requires running dev stack)
pnpm --filter @asciidocollab/web test:e2e

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint
```

## Development Stack

```bash
# Start API + Web in dev mode
pnpm dev
```

API runs on `http://localhost:4000`. Web runs on `http://localhost:3000`.
