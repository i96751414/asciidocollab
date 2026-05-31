# Data Model: Account Management & Password Forms

**Feature**: 008-account-password-forms
**Date**: 2026-05-31

---

## New Entity: EmailChangeToken

### Domain Entity

**File**: `packages/domain/src/entities/email-change-token.ts`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `EmailChangeTokenId` | Unique identifier for this token record |
| `userId` | `UserId` | The user who requested the email change |
| `tokenHash` | `string` | Cryptographic hash of the raw one-time token (raw token is sent by email only; never stored) |
| `pendingEmail` | `string` | The new email address to apply to the user account upon confirmation |
| `expiresAt` | `Date` | When the token expires |
| `usedAt` | `Date \| null` | When the token was consumed; `null` if unused |
| `createdAt` | `Date` | Creation timestamp |

**Computed properties** (mirrors `PasswordResetToken`):

| Property | Type | Description |
|----------|------|-------------|
| `isUsed` | `boolean` | `true` when `usedAt` is not null |
| `isExpired` | `boolean` | `true` when `new Date() > expiresAt` |
| `isValid` | `boolean` | `true` when `!isUsed && !isExpired` |

**Invariants**:
- `pendingEmail` must be a non-empty string (domain validates format at use-case boundary)
- `expiresAt` must be in the future at creation time
- `tokenHash` must be non-empty
- Once `isUsed` is `true`, `isValid` is always `false`

### Value Object

**File**: `packages/domain/src/value-objects/email-change-token-id.ts`

Branded UUID, mirroring `PasswordResetTokenId`.

### Repository Interface

**File**: `packages/domain/src/repositories/email-change-token.repository.ts`

```typescript
interface EmailChangeTokenRepository {
  save(token: EmailChangeToken): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<EmailChangeToken | null>;
  findActiveByUserId(userId: UserId): Promise<EmailChangeToken | null>;
  markAsUsed(id: string, usedAt: Date): Promise<void>;
  deleteByUserId(userId: UserId): Promise<void>;  // used for supersede
}
```

### Prisma Schema Addition

**File**: `packages/db/prisma/schema.prisma`

```prisma
model EmailChangeToken {
  id           String    @id @default(uuid()) @db.Uuid
  userId       String    @db.Uuid
  tokenHash    String    @unique
  pendingEmail String
  expiresAt    DateTime
  usedAt       DateTime?
  createdAt    DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

**User model update** — add relation:
```prisma
emailChangeTokens EmailChangeToken[]
```

---

## Updated: UserProfileDto

**File**: `packages/shared/src/dtos/auth.dto.ts`

Before:
```typescript
export interface UserProfileDto {
  userId: string;
}
```

After:
```typescript
export interface UserProfileDto {
  userId: string;
  displayName: string;
  email: string;
}
```

The `GET /auth/me` route handler is updated to query `displayName` and `email` from the User record and include them in the response.

---

## New DTOs

**File**: `packages/shared/src/dtos/auth.dto.ts`

```typescript
export interface UpdateDisplayNameDto {
  displayName: string;  // min 1, max 100 characters
}

export interface RequestEmailChangeDto {
  newEmail: string;     // valid email format
}
```

No DTO is needed for `GET /auth/email/confirm` — the token arrives as a URL parameter, not a request body.

---

## Token State Transitions

```
[created]
    │
    ▼
[pending / active]
    │
    ├──► [used]       — user clicked confirmation link, token was valid
    │
    ├──► [expired]    — expiresAt passed without confirmation
    │
    └──► [superseded] — new change-request made for same user (deleted before new token saved)
```

Only one active (non-used, non-expired) token per user at any time.

---

## No Changes to Other Entities

- `User` entity: `displayName` and `email` fields already exist. No new fields on the User entity.
- `PasswordResetToken`: unchanged.
- All other entities: unchanged.
