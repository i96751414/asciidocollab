# Data Model: Authentication UI & Session Flows

No new Prisma schema changes are required for this feature.
All persistence entities (User, Session, PasswordResetToken) are already defined.

---

## Domain Changes

### New Domain Error: RegistrationClosedError

**File**: `packages/domain/src/errors/registration-closed.ts`

```typescript
export class RegistrationClosedError extends DomainError {
  constructor() {
    super('Registration is closed');
  }
}
```

Used by `RegisterUserUseCase` when `hasAny()` returns `true` or when a DB
unique-constraint violation is caught and `hasAny()` re-confirms a user exists.

---

### RegisterUserUseCase — security hardening

**File**: `packages/domain/src/use-cases/register-user.ts`

Changes to `execute()`:
1. Call `userRepo.hasAny()` as the **first operation** — before password validation, before `findByEmail`. Return `RegistrationClosedError` immediately if `true`.
2. Catch DB unique-constraint violations from `userRepo.save()`. On catch, re-call `hasAny()`: if `true`, return `RegistrationClosedError`; if `false`, rethrow as unexpected error.

---

### UserRepository interface — new method

**File**: `packages/domain/src/repositories/user.repository.ts`

```
UserRepository
  + hasAny(): Promise<boolean>   // NEW — returns true if at least one user exists
```

Existing methods unchanged:
- `findById(id: UserId): Promise<User | null>`
- `findByEmail(email: Email): Promise<User | null>`
- `save(user: User): Promise<void>`

---

### New Use Case: CheckSystemSetupUseCase

**File**: `packages/domain/src/use-cases/check-system-setup.ts`

```
CheckSystemSetupUseCase
  constructor(userRepo: UserRepository)
  execute(): Promise<Result<{ configured: boolean }, never>>
```

Returns `{ configured: true }` when `userRepo.hasAny()` returns `true`,
`{ configured: false }` otherwise. No error cases — the result is always
successful (infrastructure errors propagate as thrown exceptions, consistent
with the existing pattern for read-only queries).

---

### InMemoryUserRepository — new method

**File**: `packages/domain/tests/repositories/in-memory-user.repository.ts`

```
InMemoryUserRepository
  + hasAny(): Promise<boolean>   // returns this.storage.size > 0
```

---

## Infrastructure Changes

### PrismaUserRepository — new method

**File**: `packages/infrastructure/src/repositories/prisma-user.repository.ts`

```
PrismaUserRepository
  + hasAny(): Promise<boolean>
    // prisma.user.count({ take: 1 }) > 0
    // Uses take: 1 to short-circuit — avoids full table scan
```

---

## Shared DTOs — new type

**File**: `packages/shared/src/dtos/auth.dto.ts`

```typescript
/** System setup status response. */
export interface SetupStatusDto {
  /** Whether at least one user account exists. */
  configured: boolean;
}
```

---

## Session (existing, reference only)

The `Session` table is managed by `@fastify/session` + `PrismaSessionStore`.
Fields relevant to this feature:

| Field | Type | Notes |
|---|---|---|
| `id` | String (UUID) | Session cookie value (`sessionId`) |
| `data` | String | AES-256-GCM encrypted payload containing `{ userId: string }` |
| `expiresAt` | DateTime | Absolute expiry |

The session cookie name is `sessionId` (default for `@fastify/session`).

---

## Redirect Target (runtime, not persisted)

The redirect target is passed as a URL query parameter, not stored in the
database or session:

- Set by middleware: `/login?redirect=/dashboard/projects/new`
- Read and validated by the login page server component before use
- Valid: starts with `/` AND does not start with `//`
- Invalid: falls back to `/dashboard`
- Examples rejected: `https://evil.com`, `//evil.com`, `\evil.com`
