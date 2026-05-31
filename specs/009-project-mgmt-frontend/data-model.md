# Data Model: Project Management Frontend

**Feature**: `009-project-mgmt-frontend` | **Date**: 2026-05-31

## Changes to Existing Entities

### Role (Prisma enum + Domain value object)

**Current**:
```
VIEWER | EDITOR | ADMINISTRATOR
```

**After migration**:
```
VIEWER | EDITOR | ADMINISTRATOR | OWNER
```

**Domain `Role` value object** (`packages/domain/src/value-objects/role.ts`):
```
valid values: 'viewer' | 'editor' | 'administrator' | 'owner'
```

**Shared type union** (all files in `packages/shared`):
```typescript
'viewer' | 'editor' | 'administrator' | 'owner'
```

---

### ProjectMember (existing entity — role field gains new value)

No new columns. The `role` column type changes from a 3-value enum to a 4-value enum.

**Migration behaviour**: For each existing `Project`, the `ProjectMember` row whose `userId = project.ownerId` is updated to `role = OWNER`. All other members retain their existing roles.

**Validation rule**: At all times, every project MUST have at least one member with `role = OWNER`. This invariant is enforced by:
- `ChangeMemberRoleUseCase` — when demoting an owner, checks that at least one other owner remains
- `RemoveMemberUseCase` — checks that the target is not the last owner before removal

---

### No New Entities

This feature adds no new database tables. All new behaviour is expressed through:
1. The `OWNER` role value (enum extension + backfill migration)
2. New use cases operating on existing tables
3. New API routes reading existing tables

---

## New Use Case: DeleteProjectUseCase

**Location**: `packages/domain/src/use-cases/delete-project.ts`

**Inputs**:
- `actorId: UserId` — caller must have `owner` role in the project
- `projectId: ProjectId`

**Outputs**:
- `Result<void, DomainError>`
- Failures: `PermissionDeniedError` (not an owner), `ProjectNotFoundError`

**Side effects**:
- Deletes `Project` record; Prisma cascades to `ProjectMember`, files, folders, audit logs

---

## New Error: CannotRemoveLastOwnerError

**Location**: `packages/domain/src/errors/cannot-remove-last-owner.ts`

Thrown by `ChangeMemberRoleUseCase` (demotion) and `RemoveMemberUseCase` (removal) when the operation would leave the project with zero owners.

---

## New Read: User Search

Not a persistent entity change. `GET /api/users/search` is a read-only projection over `User`:

**Query**: `q` (min 2 chars), `excludeProjectId` (optional)

**Returned fields per user**: `userId`, `displayName`, `email`

**Filtering**: Case-insensitive `ILIKE` on `displayName` and `email`. If `excludeProjectId` is provided, exclude any user already a member of that project. Limit: 10 results.

---

## Zod Schema Changes (`packages/shared/src/schemas/project.ts`)

```typescript
// Before
role: z.enum(["viewer", "editor", "administrator"])

// After (both inviteMemberSchema and updateMemberRoleSchema)
role: z.enum(["viewer", "editor", "administrator", "owner"])
```

The `owner` value in the schema is technically valid; the domain enforces the authorization constraint (only owners can assign owner).

---

## Frontend Type Changes (`apps/web/src/lib/api.ts`)

```typescript
// Project.role — before
role?: "viewer" | "editor" | "administrator"

// Project.role — after
role?: "viewer" | "editor" | "administrator" | "owner"

// ProjectMember.role — before
role: "viewer" | "editor" | "administrator"

// ProjectMember.role — after
role: "viewer" | "editor" | "administrator" | "owner"
```

New type added for user search results:
```typescript
interface UserSearchResult {
  userId: string;
  displayName: string;
  email: string;
}
```
