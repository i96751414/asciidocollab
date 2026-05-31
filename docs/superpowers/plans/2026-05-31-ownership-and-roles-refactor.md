# Ownership & Role Model Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `ownerId` field from the `Project` entity (ownership is tracked entirely through `ProjectMember.role = 'owner'`) and demote `administrator` from a project-level role to an application-level concept (`User.isAdmin`), leaving project member roles as `viewer | editor | owner` only.

**Architecture:** Ownership is now a membership concern — a project can have multiple owners, all tracked as `ProjectMember` rows with `role = 'OWNER'`. The `administrator` concept moves to a boolean flag on `User` (`isAdmin`); app admins get global access handled at the API route layer rather than inside domain use cases. Domain use cases are simplified: every operation that previously required `administrator` now requires `owner`.

**Tech Stack:** Prisma (PostgreSQL, no migrations folder — uses `prisma db push`), Node.js/TypeScript, Fastify (API), Next.js (web), Jest (tests).

---

## File Map

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | Remove `ownerId` + `owner` relation from `Project`; remove `projects` relation from `User`; remove `ADMINISTRATOR` from `Role` enum; add `isAdmin Boolean @default(false)` to `User` |
| `packages/domain/src/entities/project.ts` | Remove `ownerId` constructor param and field |
| `packages/domain/src/entities/user.ts` | Add `isAdmin: boolean` constructor param and field |
| `packages/domain/src/value-objects/role.ts` | Remove `'administrator'` from valid values |
| `packages/domain/src/repositories/project.repository.ts` | Remove `findByOwnerId`; simplify `findByMemberId` doc |
| `packages/domain/src/repositories/user.repository.ts` | No change (already has `search`) |
| `packages/domain/src/use-cases/create-project.ts` | Remove `ownerId` from `Project` construction and result DTO |
| `packages/domain/src/use-cases/archive-project.ts` | Replace `project.ownerId.equals(actorId)` with owner-role membership check |
| `packages/domain/src/use-cases/restore-project.ts` | Same as archive |
| `packages/domain/src/use-cases/invite-user.ts` | Allow only `owner` callers (remove `administrator` branch) |
| `packages/domain/src/use-cases/update-project.ts` | Allow only `owner` callers |
| `packages/domain/src/use-cases/change-member-role.ts` | Remove `administrator` caller branch; remove last-admin guard |
| `packages/domain/src/use-cases/remove-member.ts` | Remove `administrator` caller branch; remove last-admin guard |
| `packages/domain/src/errors/index.ts` | Remove `CannotRemoveLastAdminError` and `CannotChangeOwnerRoleError` exports |
| `packages/domain/src/use-cases/index.ts` | No change (re-exports use cases) |
| `packages/domain/tests/repositories/in-memory-project.repository.ts` | Remove `findByOwnerId`; simplify `findByMemberId` |
| `packages/domain/tests/repositories/in-memory-user.repository.ts` | Add `isAdmin` to stored/returned users |
| `packages/domain/tests/use-cases/archive-project.test.ts` | Remove `ownerId` from Project; add member with owner role; update non-owner test |
| `packages/domain/tests/use-cases/restore-project.test.ts` | Same as archive |
| `packages/domain/tests/use-cases/create-project.test.ts` | Remove `ownerId` from Project assertions |
| `packages/domain/tests/use-cases/invite-user.test.ts` | Rename administrator→owner in setup; add test that `editor` cannot invite |
| `packages/domain/tests/use-cases/update-project.test.ts` | Rename administrator→owner |
| `packages/domain/tests/use-cases/change-member-role.test.ts` | Remove administrator-related test cases |
| `packages/domain/tests/use-cases/remove-member.test.ts` | Remove administrator-related test cases |
| `packages/domain/tests/entities/project.test.ts` | Remove `ownerId` from construction |
| `packages/domain/tests/value-objects/value-objects.test.ts` | Remove `administrator` from valid role tests |
| `packages/infrastructure/src/persistence/prisma-project.repository.ts` | Remove `findByOwnerId`; remove `ownerId` OR clause from `findByMemberId`; remove `ownerId` from `toPersistenceProject` and `toDomainProject` |
| `packages/infrastructure/src/persistence/prisma-project-member.repository.ts` | Remove `ADMINISTRATOR` from `toPrismaRole` |
| `packages/infrastructure/src/persistence/prisma-user.repository.ts` | Add `isAdmin` to `toDomainUser` mapping and `save`/`create` operations |
| `packages/shared/src/dtos/create-project.dto.ts` | Remove `ownerId`; change `ownerRole: 'administrator'` → `ownerRole: 'owner'` |
| `packages/shared/src/dtos/project-management.dto.ts` | Replace `ownerId: string` + `ownerName: string` with `owners: { userId: string; displayName: string }[]` |
| `packages/shared/src/schemas/project.ts` | Remove `administrator` from both `z.enum` calls |
| `apps/api/src/routes/projects.ts` | Replace single `ownerName` fetch with `owners` array from member list; update response shape |
| `apps/api/src/routes/projects/members.ts` | Remove `administrator` from route-level JSON schema enums and TypeScript types; remove `mapMemberError` entries for `CannotRemoveLastAdminError` |
| `apps/web/src/lib/api.ts` | Remove `"administrator"` from `ProjectMemberRole` union |
| `apps/web/src/lib/get-project-access.ts` | Remove `administrator` from hierarchy map; update `minRole` type |
| `apps/web/src/components/member-list.tsx` | Remove `administrator` from `ALL_ROLES` |
| `apps/web/src/components/invite-member-form.tsx` | Remove `administrator` from `availableRoles` |
| `apps/web/src/components/project-card.tsx` | Update `canManage` (remove `administrator` branch) |
| `apps/web/src/app/(dashboard)/dashboard/projects/[id]/settings/page.tsx` | Change `minRole` from `"administrator"` to `"owner"` |
| `apps/web/src/app/(dashboard)/dashboard/projects/[id]/members/page.tsx` | Remove `administrator` from role check |

---

## Task 1: Update Prisma Schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Edit the schema**

Replace the current `Role` enum, `User` model, and `Project` model sections with:

```prisma
enum Role {
  VIEWER
  EDITOR
  OWNER
}

model User {
  id              String   @id @default(uuid()) @db.Uuid
  email           String   @unique
  displayName     String
  passwordHash    String?
  passwordHistory String[]
  samlSubject     String?
  mfaSecret       String?
  isAdmin         Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  memberships         ProjectMember[]
  auditLogs           AuditLog[]
  sessions            Session[]
  passwordResetTokens PasswordResetToken[]
  emailChangeTokens   EmailChangeToken[]
}

model Project {
  id          String    @id @default(uuid()) @db.Uuid
  name        String
  description String?
  tags        Json?
  archivedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  members       ProjectMember[]
  fileNodes     FileNode[]
  images        Image[]
  gitRepository GitRepository?
  auditLogs     AuditLog[]
  templates     Template[]       @relation("TemplateSourceProject")
}
```

- [ ] **Step 2: Push schema to test DB and regenerate client**

```bash
# The test containers handle the DB — just regenerate the client for type checking.
# The test containers will recreate tables with the new schema.
pnpm --filter @asciidocollab/db build
```

Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "refactor(db): remove ownerId from Project, drop ADMINISTRATOR role, add User.isAdmin"
```

---

## Task 2: Update Domain Entities

**Files:**
- Modify: `packages/domain/src/entities/project.ts`
- Modify: `packages/domain/src/entities/user.ts`

- [ ] **Step 1: Remove `ownerId` from Project entity**

In `packages/domain/src/entities/project.ts`, remove the `ownerId` constructor parameter entirely. The new constructor signature is:

```typescript
constructor(
  public readonly id: ProjectId,
  name: ProjectName,
  description: string | null,
  tags: string[],
  initialRootFolderId: FileNodeId | null,
  timestamps: Timestamps = new Timestamps(),
  initialArchivedAt: Date | null = null,
)
```

The class body and methods (`archive`, `restore`, `update`, etc.) are unchanged — only `ownerId` parameter and field are removed.

- [ ] **Step 2: Add `isAdmin` to User entity**

In `packages/domain/src/entities/user.ts`, add `isAdmin: boolean` as the last constructor param before `timestamps`:

```typescript
constructor(
  public readonly id: UserId,
  public readonly email: Email,
  public readonly displayName: string,
  public readonly passwordHash: string | null,
  public readonly passwordHistory: string[],
  public readonly samlSubject: string | null,
  public readonly mfaSecret: string | null,
  public readonly isAdmin: boolean = false,
  public readonly timestamps: Timestamps = new Timestamps(),
) {
  if (!this.passwordHash && !this.samlSubject) {
    throw new Error('User must have at least one of passwordHash or samlSubject');
  }
}
```

- [ ] **Step 3: Build domain to see cascade failures**

```bash
pnpm --filter @asciidocollab/domain exec tsc --noEmit 2>&1 | head -40
```

Expected: many errors — these identify everything to fix. Do not commit yet.

---

## Task 3: Update Role Value Object

**Files:**
- Modify: `packages/domain/src/value-objects/role.ts`

- [ ] **Step 1: Remove `'administrator'` from valid values**

```typescript
static create(value: string): Role {
  if (
    value !== 'viewer' &&
    value !== 'editor' &&
    value !== 'owner'
  ) {
    throw new ValidationError(`Invalid Role: ${value}`);
  }
  return new Role(value);
}
```

- [ ] **Step 2: Run value-object tests**

```bash
npx jest "value-objects" 2>&1 | tail -10
```

Expected: the test that previously included `'administrator'` as a valid role now fails.

- [ ] **Step 3: Update the value-object test**

In `packages/domain/tests/value-objects/value-objects.test.ts`, find the Role section and update:

- Remove `'administrator'` from the valid-roles list.
- Update the invalid-role test to include `'administrator'` as an invalid value (to confirm it's no longer accepted).

The test should look like:

```typescript
describe('Role', () => {
  test.each(['viewer', 'editor', 'owner'])('creates valid role: %s', (value) => {
    expect(Role.create(value).value).toBe(value);
  });

  test.each(['administrator', 'superuser', ''])('throws for invalid role: %s', (value) => {
    expect(() => Role.create(value)).toThrow(ValidationError);
  });
});
```

- [ ] **Step 4: Run value-object tests again**

```bash
npx jest "value-objects" 2>&1 | tail -10
```

Expected: PASS.

---

## Task 4: Update Domain Errors

**Files:**
- Modify: `packages/domain/src/errors/index.ts`

- [ ] **Step 1: Remove obsolete error exports**

`CannotRemoveLastAdminError` and `CannotChangeOwnerRoleError` no longer apply (there is no `administrator` project role). Remove their exports from the barrel file:

```typescript
// DELETE these two lines:
// export { CannotChangeOwnerRoleError } from './cannot-change-owner-role';
// export { CannotRemoveLastAdminError } from './cannot-remove-last-admin';
```

Leave the files on disk — do not delete them — in case they are referenced by existing tests that we'll update in later tasks. Once all references are gone we can delete them, but that's outside this plan's scope.

- [ ] **Step 2: Commit errors barrel change**

```bash
git add packages/domain/src/errors/index.ts
git commit -m "refactor(domain): remove CannotRemoveLastAdminError and CannotChangeOwnerRoleError from public API"
```

---

## Task 5: Update ProjectRepository Interface

**Files:**
- Modify: `packages/domain/src/repositories/project.repository.ts`

- [ ] **Step 1: Remove `findByOwnerId`**

Delete the `findByOwnerId` method declaration and its JSDoc from the interface. The interface now starts with `findById`, then `findByMemberId`.

Also update the `findByMemberId` JSDoc to no longer mention "not just owner" since ownership is a membership concern:

```typescript
/**
 * Finds all projects where the user is a member.
 *
 * @param userId - The unique identifier of the user.
 * @param pagination - Pagination parameters.
 * @param includeArchived - Whether to include archived projects.
 * @returns Paginated list of projects.
 */
findByMemberId(
  userId: UserId,
  pagination: PaginationParameters,
  includeArchived?: boolean,
): Promise<PaginatedProjects>;
```

---

## Task 6: Update `create-project` Use Case

**Files:**
- Modify: `packages/domain/src/use-cases/create-project.ts`

- [ ] **Step 1: Update `CreateProjectResultDto` and use case**

The `Project` constructor no longer takes `ownerId`. The result DTO no longer returns `ownerId`. The new implementation:

```typescript
// CreateProjectResultDto (top of file):
export interface CreateProjectResultDto {
  projectId: ProjectId;
  rootFolderId: FileNodeId;
  ownerRole: string;
}

// Inside execute(), replace the Project construction:
const project = new Project(
  projectId,
  ProjectName.create(input.name),
  input.description ?? null,
  input.initialTags ?? [],
  null,
);

// Replace the return value:
return {
  success: true,
  value: {
    projectId,
    rootFolderId,
    ownerRole: Role.create('owner').value,
  },
};
```

The `ProjectMember` creation stays the same (already uses `Role.create('owner')`).

---

## Task 7: Update `archive-project` and `restore-project` Use Cases

**Files:**
- Modify: `packages/domain/src/use-cases/archive-project.ts`
- Modify: `packages/domain/src/use-cases/restore-project.ts`

Both use cases currently check `project.ownerId.equals(actorId)`. Replace with a membership check for the `owner` role.

- [ ] **Step 1: Update `archive-project.ts`**

Remove the `ProjectMemberRepository` import and constructor parameter — wait, it's already in the constructor. Both use cases already have `this.projectMemberRepo`. Replace the ownerId check:

```typescript
// REMOVE: if (!project.ownerId.equals(actorId)) {
// ADD:
const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
if (callerMembership?.role.value !== 'owner') {
  return { success: false, error: new PermissionDeniedError() };
}
```

- [ ] **Step 2: Update `restore-project.ts`**

Same change — replace `project.ownerId.equals(actorId)` with the membership check.

---

## Task 8: Update `invite-user`, `update-project`, `change-member-role`, `remove-member` Use Cases

**Files:**
- Modify: `packages/domain/src/use-cases/invite-user.ts`
- Modify: `packages/domain/src/use-cases/update-project.ts`
- Modify: `packages/domain/src/use-cases/change-member-role.ts`
- Modify: `packages/domain/src/use-cases/remove-member.ts`

- [ ] **Step 1: Update `invite-user.ts`**

Change the caller check from `callerRole !== 'administrator' && callerRole !== 'owner'` to:

```typescript
const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
if (callerMembership?.role.value !== 'owner') {
  return { success: false, error: new PermissionDeniedError() };
}
// The guard "only owners may invite with owner role" is now redundant — only owners can invite at all.
// Remove the second guard for role.value === 'owner'.
```

- [ ] **Step 2: Update `update-project.ts`**

```typescript
const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
if (callerMembership?.role.value !== 'owner') {
  return { success: false, error: new PermissionDeniedError() };
}
```

- [ ] **Step 3: Update `change-member-role.ts`**

Remove the `CannotRemoveLastAdminError` import. Simplify to:

```typescript
const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
if (callerMembership?.role.value !== 'owner') {
  return { success: false, error: new PermissionDeniedError() };
}

const project = await this.projectRepo.findById(projectId);
if (!project) {
  return { success: false, error: new ProjectNotFoundError(projectId.value) };
}

const targetMembership = await this.projectMemberRepo.findByCompositeKey(projectId, targetUserId);
if (!targetMembership) {
  return { success: false, error: new MemberNotFoundError(projectId.value, targetUserId.value) };
}

// Guard: cannot demote the last owner
if (targetMembership.role.value === 'owner' && newRole.value !== 'owner') {
  const members = await this.projectMemberRepo.findByProjectId(projectId);
  const ownerCount = members.filter((m) => m.role.value === 'owner').length;
  if (ownerCount <= 1) {
    return { success: false, error: new CannotRemoveLastOwnerError(projectId.value) };
  }
}

await this.projectMemberRepo.updateRole(projectId, targetUserId, newRole);
await this.auditLogRepo.save(new AuditLog(
  AuditLogId.create(randomUUID()), actorId, projectId,
  'member.roleChanged', 'ProjectMember', targetUserId.value,
));
return { success: true, value: undefined };
```

Also remove unused imports: `CannotRemoveLastAdminError`.

- [ ] **Step 4: Update `remove-member.ts`**

Remove the `CannotRemoveLastAdminError` import. Simplify:

```typescript
const callerMembership = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
if (callerMembership?.role.value !== 'owner') {
  return { success: false, error: new PermissionDeniedError() };
}

const project = await this.projectRepo.findById(projectId);
if (!project) {
  return { success: false, error: new ProjectNotFoundError(projectId.value) };
}

const targetMembership = await this.projectMemberRepo.findByCompositeKey(projectId, targetUserId);
if (!targetMembership) {
  return { success: false, error: new MemberNotFoundError(projectId.value, targetUserId.value) };
}

// Guard: cannot remove the last owner
if (targetMembership.role.value === 'owner') {
  const members = await this.projectMemberRepo.findByProjectId(projectId);
  const ownerCount = members.filter((m) => m.role.value === 'owner').length;
  if (ownerCount <= 1) {
    return { success: false, error: new CannotRemoveLastOwnerError(projectId.value) };
  }
}

await this.projectMemberRepo.removeMember(projectId, targetUserId);
await this.auditLogRepo.save(new AuditLog(
  AuditLogId.create(randomUUID()), actorId, projectId,
  'member.removed', 'ProjectMember', targetUserId.value,
));
return { success: true, value: undefined };
```

---

## Task 9: Update In-Memory Test Repositories

**Files:**
- Modify: `packages/domain/tests/repositories/in-memory-project.repository.ts`
- Modify: `packages/domain/tests/repositories/in-memory-user.repository.ts`

- [ ] **Step 1: Update `InMemoryProjectRepository`**

Remove the `findByOwnerId` method. Simplify `findByMemberId` to not use `ownerId`:

```typescript
async findByMemberId(
  userId: UserId,
  pagination: PaginationParameters,
  includeArchived = false,
): Promise<PaginatedProjects> {
  const memberProjectIds = this.membershipMap.get(userId.value) ?? new Set<string>();
  let all = [...this.storage.values()].filter(
    (p) => memberProjectIds.has(p.id.value),
  );
  if (!includeArchived) {
    all = all.filter((p) => p.archivedAt === null);
  }
  const total = all.length;
  const page = pagination.page;
  const limit = pagination.limit;
  const projects = all.slice((page - 1) * limit, page * limit);
  return { projects, total, page, limit, totalPages: Math.ceil(total / limit) };
}
```

Remove the `addMembership`-based workaround if any test used `ownerId` matching — the in-memory repo now requires explicit `addMembership` calls for every member including owners.

- [ ] **Step 2: Update `InMemoryUserRepository`**

In `packages/domain/tests/repositories/in-memory-user.repository.ts`, the `search` method and user lookups need to handle the new `isAdmin` field on `User`. Since `User` now takes `isAdmin`, any place the repo constructs a `User` must pass `false` as the default. Verify the repo just stores/retrieves `User` instances (doesn't construct them) — if so, no change is needed other than confirming the `findById`, `findByEmail`, etc. methods still work.

---

## Task 10: Update Domain Tests

**Files:**
- Modify: `packages/domain/tests/entities/project.test.ts`
- Modify: `packages/domain/tests/use-cases/archive-project.test.ts`
- Modify: `packages/domain/tests/use-cases/restore-project.test.ts`
- Modify: `packages/domain/tests/use-cases/create-project.test.ts`
- Modify: `packages/domain/tests/use-cases/invite-user.test.ts`
- Modify: `packages/domain/tests/use-cases/update-project.test.ts`
- Modify: `packages/domain/tests/use-cases/change-member-role.test.ts`
- Modify: `packages/domain/tests/use-cases/remove-member.test.ts`

- [ ] **Step 1: Update `project.test.ts`**

Remove `ownerId` from every `new Project(...)` call. The Project constructor is now:
```
(id, name, description, tags, rootFolderId, timestamps?, archivedAt?)
```

Example:
```typescript
// BEFORE:
const project = new Project(projectId, ProjectName.create('Test'), null, ownerId, [], null);
// AFTER:
const project = new Project(projectId, ProjectName.create('Test'), null, [], null);
```

- [ ] **Step 2: Update `archive-project.test.ts`**

The test creates a project with `ownerId` and an owner member with `administrator` role. After refactoring:
- Remove `ownerId` from project construction.
- Change the owner member role from `'administrator'` to `'owner'`.
- The `nonMemberId` test should still return `PermissionDeniedError` since `findByCompositeKey` returns null for a non-member.

```typescript
const project = new Project(
  projectId,
  ProjectName.create('Test Project'),
  null,
  [],
  null,
);
await projectRepo.save(project);
// Add the calling user as an owner member:
await memberRepo.addMember(new ProjectMember(projectId, ownerId, Role.create('owner'), new Date()));

// Update the "non-owner tries to archive" test:
// Use an ID that is NOT a member at all, or a member with 'editor' role.
// Add an editor member and test that they receive PermissionDeniedError.
const editorId = UserId.create('550e8400-e29b-41d4-a716-446655440002');
await memberRepo.addMember(new ProjectMember(projectId, editorId, Role.create('editor'), new Date()));
const result = await useCase.execute(editorId, projectId);
expect(result.success).toBe(false);
expect(result.error).toBeInstanceOf(PermissionDeniedError);
```

- [ ] **Step 3: Update `restore-project.test.ts`**

Same pattern: remove `ownerId`, change owner member role to `'owner'`, update non-owner test to use an editor member.

- [ ] **Step 4: Update `create-project.test.ts`**

Remove assertions about `result.value.ownerId`. The result no longer includes it.

- [ ] **Step 5: Update `invite-user.test.ts`**

Change the caller from `administrator` role to `owner` role. Add a test that an `editor` member cannot invite:

```typescript
test('returns PermissionDeniedError when caller is an editor', async () => {
  const editorId = UserId.create('...some-uuid...');
  await memberRepo.addMember(new ProjectMember(projectId, editorId, Role.create('editor'), new Date()));
  const inviteeEmail = Email.create('new@example.com');
  await userRepo.save(/* some user with that email */);
  const result = await useCase.execute(editorId, projectId, inviteeEmail, Role.create('viewer'));
  expect(result.success).toBe(false);
  expect(result.error).toBeInstanceOf(PermissionDeniedError);
});
```

- [ ] **Step 6: Update `update-project.test.ts`**

Change caller from `administrator` to `owner`.

- [ ] **Step 7: Update `change-member-role.test.ts`**

Remove all tests that reference `administrator` role as a caller or target. Add/retain:
- Owner can change editor → viewer.
- Cannot demote last owner.
- Non-owner (editor) cannot change roles.
- `MemberNotFoundError` when target is not a member.

- [ ] **Step 8: Update `remove-member.test.ts`**

Remove all tests that reference `administrator` role as caller or guard for last-admin. Keep:
- Owner can remove editor.
- Cannot remove last owner.
- Non-owner cannot remove.
- `MemberNotFoundError` when target is not a member.

- [ ] **Step 9: Run domain tests**

```bash
pnpm --filter @asciidocollab/domain test 2>&1 | tail -10
```

Expected: all 246+ tests pass.

- [ ] **Step 10: Build domain**

```bash
pnpm --filter @asciidocollab/domain build 2>&1 | tail -5
```

Expected: `$ tsc` with no output (success).

- [ ] **Step 11: Commit**

```bash
git add packages/domain/
git commit -m "refactor(domain): remove ownerId from Project entity; remove administrator project role; add User.isAdmin"
```

---

## Task 11: Update Infrastructure

**Files:**
- Modify: `packages/infrastructure/src/persistence/prisma-project.repository.ts`
- Modify: `packages/infrastructure/src/persistence/prisma-project-member.repository.ts`
- Modify: `packages/infrastructure/src/persistence/prisma-user.repository.ts`

- [ ] **Step 1: Update `prisma-project.repository.ts`**

Remove the `findByOwnerId` method. Update `findByMemberId` — remove the `ownerId` OR clause:

```typescript
async findByMemberId(
  userId: UserId,
  pagination: PaginationParameters,
  includeArchived = false,
): Promise<PaginatedProjects> {
  const where: Record<string, unknown> = {
    members: { some: { userId: userId.value } },
  };
  if (!includeArchived) where.archivedAt = null;

  const [records, total] = await Promise.all([
    this.prisma.project.findMany({
      where, skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit, orderBy: { updatedAt: 'desc' },
    }),
    this.prisma.project.count({ where }),
  ]);
  return {
    projects: records.map(toDomainProject), total,
    page: pagination.page, limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}
```

Update `toPersistenceProject` and `toDomainProject` to remove `ownerId`:

```typescript
// toPersistenceProject: remove ownerId field
function toPersistenceProject(project: Project) {
  return {
    id: project.id.value,
    name: project.name.value,
    description: project.description,
    tags: project.tags.length > 0 ? project.tags : undefined,
    archivedAt: project.archivedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

// toDomainProject: remove ownerId from record type and Project construction
function toDomainProject(record: {
  id: string; name: string; description: string | null;
  tags: unknown; archivedAt: Date | null; createdAt: Date; updatedAt: Date;
}): Project {
  return new Project(
    ProjectId.create(record.id),
    ProjectName.create(record.name),
    record.description,
    Array.isArray(record.tags) ? record.tags as string[] : [],
    null,
    new Timestamps(record.createdAt, record.updatedAt),
    record.archivedAt,
  );
}
```

- [ ] **Step 2: Update `prisma-project-member.repository.ts`**

Remove `ADMINISTRATOR` from `toPrismaRole`:

```typescript
function toPrismaRole(value: string): 'VIEWER' | 'EDITOR' | 'OWNER' {
  if (value === 'viewer') return 'VIEWER';
  if (value === 'editor') return 'EDITOR';
  return 'OWNER';
}
```

- [ ] **Step 3: Update `prisma-user.repository.ts`**

Add `isAdmin` to the `toDomainUser` mapping:

```typescript
function toDomainUser(record: {
  id: string; email: string; displayName: string; passwordHash: string | null;
  passwordHistory: string[]; samlSubject: string | null; mfaSecret: string | null;
  isAdmin: boolean; createdAt: Date; updatedAt: Date;
}): User {
  return new User(
    UserId.create(record.id),
    Email.create(record.email),
    record.displayName,
    record.passwordHash,
    record.passwordHistory,
    record.samlSubject,
    record.mfaSecret,
    record.isAdmin,
    new Timestamps(record.createdAt, record.updatedAt),
  );
}
```

Also update any `prisma.user.create` or `prisma.user.update` calls in the repository to include `isAdmin` if they upsert the full record.

- [ ] **Step 4: Build infrastructure**

```bash
pnpm --filter @asciidocollab/infrastructure build 2>&1 | tail -5
```

Expected: `$ tsc` with no output.

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/
git commit -m "refactor(infra): remove ownerId from project persistence; remove ADMINISTRATOR from role mapping; add isAdmin to user mapping"
```

---

## Task 12: Update Shared DTOs and Schemas

**Files:**
- Modify: `packages/shared/src/dtos/create-project.dto.ts`
- Modify: `packages/shared/src/dtos/project-management.dto.ts`
- Modify: `packages/shared/src/schemas/project.ts`

- [ ] **Step 1: Update `create-project.dto.ts`**

```typescript
/** Output data returned after a project is created. */
export interface CreateProjectResultDto {
  projectId: string;
  rootFolderId: string;
  ownerRole: 'owner';
}
```

Remove `ownerId: string` from the result DTO.

- [ ] **Step 2: Update `project-management.dto.ts`**

Replace `ownerId: string` and `ownerName: string` with an `owners` array:

```typescript
export interface ProjectDto {
  /** Unique project identifier. */
  id: string;
  /** Display name of the project. */
  name: string;
  /** Optional project description. */
  description: string | null;
  /** Users with the owner role on this project. */
  owners: { userId: string; displayName: string }[];
  /** Categorization tags. */
  tags: string[];
  /** Root folder identifier. */
  rootFolderId: string | null;
  /** Archive timestamp, null if not archived. */
  archivedAt: string | null;
  /** Number of project members. */
  memberCount?: number;
  /** Current user's role in the project. */
  role?: 'viewer' | 'editor' | 'owner';
  /** Creation timestamp. */
  createdAt: string;
  /** Last update timestamp. */
  updatedAt: string;
}
```

- [ ] **Step 3: Update `schemas/project.ts`**

In both `inviteMemberSchema` and `updateMemberRoleSchema`, remove `"administrator"` from the enums:

```typescript
export const inviteMemberSchema = z.object({
  email: z.email("Invalid email address"),
  role: z.enum(["viewer", "editor", "owner"]),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["viewer", "editor", "owner"]),
});
```

- [ ] **Step 4: Build shared**

```bash
pnpm --filter @asciidocollab/shared build 2>&1 | tail -5
```

Expected: `$ tsc` with no output.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/
git commit -m "refactor(shared): replace ownerId/ownerName with owners array; remove administrator from role schemas"
```

---

## Task 13: Update API Routes

**Files:**
- Modify: `apps/api/src/routes/projects.ts`
- Modify: `apps/api/src/routes/projects/members.ts`

- [ ] **Step 1: Update `projects.ts` — list endpoint**

In the `GET /api/projects` handler, replace the single `owner` lookup with an `owners` array built from the member list:

```typescript
const projectsWithData = await Promise.all(
  result.value.projects.map(async (project) => {
    const members = await request.server.repos.projectMember.findByProjectId(project.id);
    const memberCount = members.length;

    const userMembership = members.find(
      (m) => m.userId.value === userId,
    );

    const ownerMembers = members.filter((m) => m.role.value === 'owner');
    const ownerUsers = await Promise.all(
      ownerMembers.map((m) => request.server.repos.user.findById(m.userId)),
    );
    const owners = ownerUsers
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .map((u) => ({ userId: u.id.value, displayName: u.displayName }));

    return {
      id: project.id.value,
      name: project.name.value,
      description: project.description,
      owners,
      tags: [...project.tags],
      rootFolderId: project.rootFolderId?.value ?? null,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      memberCount,
      role: userMembership?.role.value ?? 'viewer',
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }),
);
```

- [ ] **Step 2: Update `projects.ts` — single project endpoint**

In `GET /api/projects/:id`, replace `owner` fetch with owners array:

```typescript
const members = await request.server.repos.projectMember.findByProjectId(ProjectId.create(id));
const userMembership = members.find((m) => m.userId.value === userId);
if (!userMembership) {
  return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this project' } });
}
const ownerMembers = members.filter((m) => m.role.value === 'owner');
const ownerUsers = await Promise.all(
  ownerMembers.map((m) => request.server.repos.user.findById(m.userId)),
);
const owners = ownerUsers
  .filter((u): u is NonNullable<typeof u> => u !== null)
  .map((u) => ({ userId: u.id.value, displayName: u.displayName }));

return reply.status(200).send({
  data: {
    id: project.id.value,
    name: project.name.value,
    description: project.description,
    owners,
    tags: [...project.tags],
    rootFolderId: project.rootFolderId?.value ?? null,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    role: userMembership.role.value,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  },
});
```

- [ ] **Step 3: Update `projects.ts` — create endpoint response**

Remove `ownerId` from the response object in `POST /api/projects`.

- [ ] **Step 4: Update `members.ts`**

Remove `"administrator"` from all JSON schema `enum` arrays and TypeScript union types. Remove `CannotRemoveLastAdminError` from `mapMemberError`.

The enum arrays become `["viewer", "editor", "owner"]`. The union types become `"viewer" | "editor" | "owner"`.

- [ ] **Step 5: Type-check API**

```bash
pnpm --filter api exec tsc --noEmit 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/
git commit -m "refactor(api): replace ownerId/ownerName with owners array; remove administrator from member routes"
```

---

## Task 14: Update Web Frontend

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/get-project-access.ts`
- Modify: `apps/web/src/components/member-list.tsx`
- Modify: `apps/web/src/components/invite-member-form.tsx`
- Modify: `apps/web/src/components/project-card.tsx`
- Modify: `apps/web/src/app/(dashboard)/dashboard/projects/[id]/settings/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/dashboard/projects/[id]/members/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/dashboard/projects/[id]/members/members-client.tsx`

- [ ] **Step 1: Update `api.ts`**

Change `ProjectMemberRole` to remove `"administrator"`:
```typescript
export type ProjectMemberRole = "viewer" | "editor" | "owner";
```

Update `Project` interface — replace `ownerId`/`ownerName` with `owners`:
```typescript
export interface Project {
  id: string;
  name: string;
  description: string | null;
  owners: { userId: string; displayName: string }[];
  tags: string[];
  rootFolderId: string | null;
  archivedAt: string | null;
  memberCount?: number;
  role?: ProjectMemberRole;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Update `get-project-access.ts`**

Remove `administrator` from the `roleRank` map and `minRole` type:

```typescript
const roleRank: Record<ProjectMemberRole, number> = {
  viewer: 0, editor: 1, owner: 2,
};

export async function getProjectAccess(
  projectId: string,
  minRole: ProjectMemberRole = 'viewer',
): Promise<ProjectAccess>
```

- [ ] **Step 3: Update `member-list.tsx`**

```typescript
const ALL_ROLES: ProjectMemberRole[] = ["viewer", "editor", "owner"];
```

Remove the `availableRoles` branching — since there's only `owner` as the elevated role, the list is always `ALL_ROLES` for owners and `["viewer", "editor"]` for editors (editors cannot change roles at all — that's blocked by the domain, but we can hide the controls):

```typescript
// Owners see all roles; non-owners see no role controls at all
// (the server will reject non-owner role changes anyway)
const canManageRoles = currentUserRole === "owner";
```

Only render the role `<select>` and Remove button when `canManageRoles` is true (or for the current user to see their own role as read-only).

- [ ] **Step 4: Update `invite-member-form.tsx`**

Remove the `availableRoles` branching — only owners can reach this form (access is controlled by `getProjectAccess`), so always show `["viewer", "editor", "owner"]`:

```typescript
const availableRoles: ProjectMemberRole[] = ["viewer", "editor", "owner"];
```

Remove the `isOwner` / `currentUserRole` prop entirely — the form is only shown to owners.

- [ ] **Step 5: Update `project-card.tsx`**

`canManage` was `project.role === "administrator" || project.role === "owner"`. Now:

```typescript
const canManage = project.role === "owner";
```

- [ ] **Step 6: Update `settings/page.tsx`**

Change `minRole` from `"administrator"` to `"owner"`:

```typescript
const { project, currentUserRole } = await getProjectAccess(id, "owner");
```

- [ ] **Step 7: Update `members/page.tsx`**

Remove `"administrator"` from the `allowedManagementRoles` check (or whatever the guard is in that file). The settings page now requires `owner`.

- [ ] **Step 8: Update `members-client.tsx`**

Remove `"administrator"` from `validRoles` array; change the management role check from `administrator|owner` to `owner` only.

- [ ] **Step 9: Update any component that displays `ownerName`**

Search for `ownerName` and `ownerId` in the web app — replace with rendering of `project.owners`:

```typescript
// Display owners as a comma-separated list of display names:
const ownerNames = project.owners.map((o) => o.displayName).join(', ');
```

- [ ] **Step 10: Type-check web**

```bash
pnpm --filter web exec tsc --noEmit 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/web/
git commit -m "refactor(web): remove administrator role from UI; show owners list instead of single ownerName"
```

---

## Task 15: Update API Tests

**Files:**
- Modify: `apps/api/tests/projects-members.test.ts`
- Modify: `apps/api/tests/projects-delete.test.ts`
- Modify: `apps/api/tests/users-search.test.ts`
- Modify: `apps/api/tests/plugins/origin-check.test.ts`
- Possibly modify other test files that reference `administrator` or `ownerId`

- [ ] **Step 1: Scan for references**

```bash
grep -rn "administrator\|ownerId\|ownerName" apps/api/tests/ 2>/dev/null
```

- [ ] **Step 2: Replace `administrator` with `owner` in test payloads**

Any test that invites a member with `role: 'administrator'` should be changed to `role: 'owner'`. Tests that check role-change behaviour for `administrator` should be updated to `owner`/`editor`.

- [ ] **Step 3: Update response shape assertions**

Any test that checks `response.json().data.ownerId` or `.ownerName` should be updated to check `response.json().data.owners` (an array).

- [ ] **Step 4: Run all API tests**

```bash
pnpm --filter api test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/
git commit -m "test(api): update tests for new ownership model and removed administrator role"
```

---

## Task 16: End-to-End Smoke Test

- [ ] **Step 1: Run the full test suite**

```bash
pnpm --filter @asciidocollab/domain test && pnpm --filter api test
```

Expected: all suites pass.

- [ ] **Step 2: Type-check all packages**

```bash
pnpm --filter @asciidocollab/domain exec tsc --noEmit && \
pnpm --filter @asciidocollab/infrastructure exec tsc --noEmit && \
pnpm --filter api exec tsc --noEmit && \
pnpm --filter web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "refactor: complete ownership model and role refactor — ownerId removed, administrator demoted to app-level isAdmin"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `ownerId` removed from Project entity and DB schema
- [x] `ADMINISTRATOR` removed from `Role` enum; data path handles `'OWNER'` default
- [x] `isAdmin` added to `User` entity and DB — foundation for app-level admin
- [x] `owners: []` array replaces `ownerId`/`ownerName` in all API responses and DTOs
- [x] Archive and restore use cases now check member role instead of `project.ownerId`
- [x] All project-level role checks simplified to `owner` only
- [x] Frontend updated — role dropdowns, access guards, project display
- [x] Tests updated at every layer

**Gaps identified:**
- App-level admin behavior at the API route layer (bypassing domain checks for `user.isAdmin`) is **intentionally deferred** — the `isAdmin` field is added as foundation. A follow-on plan should add: `GET /api/projects` returns all projects for admins, use-case bypass or API-layer short-circuit for admin overrides, admin management UI.
- No migration script for existing `ADMINISTRATOR` → `OWNER` data is written here because the project uses `prisma db push` (no migration history). If the schema is pushed to a database with existing data, those rows will fail until the data is manually updated. A one-time SQL script for production should be run before `db push`: `UPDATE "ProjectMember" SET role = 'OWNER' WHERE role = 'ADMINISTRATOR';`
