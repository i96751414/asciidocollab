# Data Model: Multi-User Registration & User Management

**Feature**: `010-user-registration-management`
**Date**: 2026-06-01

---

## Schema Changes

### Modified: `User`

Add two new fields and one new enum:

```prisma
enum RegistrationMethod {
  SELF_REGISTERED
  INVITED
}

model User {
  // existing fields ...
  emailVerified      Boolean            @default(true)          // true for existing users; false for new self-registered users until verified
  registrationMethod RegistrationMethod @default(SELF_REGISTERED) // audit trail: how this user entered the system
  // existing relations ...
}
```

**Migration note**: Default `true` for `emailVerified` ensures all existing user accounts (the initial admin) are not locked out. Default `SELF_REGISTERED` for `registrationMethod` is correct for the initial admin created during setup.

---

### Modified: `AuditLog`

Make `userId` nullable with `SetNull` on user deletion, to preserve historical audit records after a user is removed:

```prisma
model AuditLog {
  userId    String?  @db.Uuid          // nullable — set to NULL when the user is hard-deleted
  // ...
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
}
```

---

### New: `UserInvitation`

Tracks pending application-level registrations initiated by an admin.

```prisma
model UserInvitation {
  id              String    @id @default(uuid()) @db.Uuid
  recipientEmail  String
  invitedByUserId String?   @db.Uuid       // nullable — admin may be removed after sending invite
  tokenHash       String    @unique         // SHA-256 hash of the raw invitation token
  expiresAt       DateTime
  acceptedAt      DateTime?                 // null until the invitation is completed
  createdAt       DateTime  @default(now())

  invitedBy User? @relation(fields: [invitedByUserId], references: [id], onDelete: SetNull)

  @@index([recipientEmail])
  @@index([expiresAt])
}
```

**Security invariants**:
- `tokenHash` is never the raw token — only the SHA-256 digest is stored.
- Once `acceptedAt` is set, the token is consumed and cannot be reused.
- Tokens with `expiresAt < now()` are treated as expired regardless of `acceptedAt`.

---

### New: `EmailVerificationToken`

Tracks one-time email verification tokens for self-registered users.

```prisma
model EmailVerificationToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  tokenHash String    @unique               // SHA-256 hash of the raw verification token
  expiresAt DateTime
  usedAt    DateTime?                       // null until verified
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

**Security invariants**:
- Only one active (unused, unexpired) token per user at a time — previous tokens are invalidated (deleted or marked used) when a new one is requested.
- `onDelete: Cascade` ensures tokens are cleaned up when a user is removed.

---

### New: `SystemSetting`

Persists runtime-configurable application settings (open registration toggle and future settings).

```prisma
model SystemSetting {
  key       String   @id        // e.g., "openRegistration"
  value     String              // encoded value (e.g., "true", "false")
  updatedAt DateTime @updatedAt
}
```

**Known keys**:

| Key | Type | Default (absent = false) | Description |
|-----|------|--------------------------|-------------|
| `openRegistration` | boolean | `false` | Whether unauthenticated users can self-register |

---

## Domain Entities

### New: `UserInvitationId` (value object)

UUID wrapper — follows the existing `UserId`, `ProjectId` pattern.

---

### New: `UserInvitation` (entity)

```typescript
class UserInvitation {
  constructor(
    readonly id: UserInvitationId,
    readonly recipientEmail: Email,
    readonly invitedByUserId: UserId | null,
    readonly tokenHash: string,          // SHA-256 hex digest
    readonly expiresAt: Date,
    readonly acceptedAt: Date | null,
    readonly createdAt: Date,
  ) {}

  get isAccepted(): boolean { return this.acceptedAt !== null; }
  get isExpired(): boolean { return new Date() > this.expiresAt; }
  get isValid(): boolean { return !this.isAccepted && !this.isExpired; }
}
```

---

### New: `EmailVerificationTokenId` (value object)

UUID wrapper.

---

### New: `EmailVerificationToken` (entity)

```typescript
class EmailVerificationToken {
  constructor(
    readonly id: EmailVerificationTokenId,
    readonly userId: UserId,
    readonly tokenHash: string,          // SHA-256 hex digest
    readonly expiresAt: Date,
    readonly usedAt: Date | null,
    readonly createdAt: Date,
  ) {}

  get isUsed(): boolean { return this.usedAt !== null; }
  get isExpired(): boolean { return new Date() > this.expiresAt; }
  get isValid(): boolean { return !this.isUsed && !this.isExpired; }
}
```

---

### Modified: `User` (entity)

Add two new constructor parameters:
- `emailVerified: boolean` — default `false`; set to `true` for invited users and the initial setup admin
- `registrationMethod: RegistrationMethod` — `'SELF_REGISTERED' | 'INVITED'` TypeScript string-literal union; exported from `packages/domain/src/types/index.ts`

The constructor invariant (passwordHash or samlSubject required) remains unchanged.

---

## Domain Repository Interfaces

### New: `UserInvitationRepository`

```typescript
interface UserInvitationRepository {
  save(invitation: UserInvitation): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<UserInvitation | null>;
  findPendingByEmail(email: Email): Promise<UserInvitation | null>;
  findAll(): Promise<UserInvitation[]>;          // admin list view
}
```

---

### New: `EmailVerificationTokenRepository`

```typescript
interface EmailVerificationTokenRepository {
  save(token: EmailVerificationToken): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null>;
  deleteByUserId(userId: UserId): Promise<void>;  // invalidate old tokens before issuing a new one
}
```

---

### New: `SystemSettingRepository`

```typescript
interface SystemSettingRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
```

---

### New: `SessionRepository`

```typescript
interface SessionRepository {
  deleteByUserId(userId: UserId): Promise<void>;  // invalidates all sessions for a user
}
```

---

## Domain Service Interfaces

### New: `RegistrationInvitationNotifier`

```typescript
interface RegistrationInvitationNotifier {
  sendInvitation(recipientEmail: Email, rawToken: string, invitedBy: string): Promise<void>;
}
```

---

### New: `EmailVerificationNotifier`

```typescript
interface EmailVerificationNotifier {
  sendVerificationEmail(recipientEmail: Email, rawToken: string): Promise<void>;
  sendResendVerificationEmail(recipientEmail: Email, rawToken: string): Promise<void>;
}
```

---

## Domain Use Cases

### Refactored: `RegisterUseCase` (class renamed from `RegisterUserUseCase`; file remains `register-user.ts`)

Handles both initial-admin registration and open self-registration:

1. If `userRepo.hasAny()` is false → first user path: create admin, `emailVerified = true`, `registrationMethod = 'SELF_REGISTERED'`, no verification email.
2. Else check `systemSettingRepo.get("openRegistration")`:
   - `"false"` or absent → return `RegistrationClosedError`.
   - `"true"` → self-registration path: validate password, create user with `emailVerified = false` and `registrationMethod = 'SELF_REGISTERED'`, create `EmailVerificationToken`, send verification email.

**New error**: `EmailAlreadyRegisteredError` (not exposed to client — see anti-enumeration decision).

---

### New: `VerifyEmailUseCase`

1. SHA-256 hash the raw token from the request.
2. Look up `EmailVerificationToken` by `tokenHash`.
3. If not found, expired, or already used → return `InvalidTokenError`.
4. Load the `User` by `token.userId`.
5. Mark token `usedAt = now()`, set `User.emailVerified = true`, save.
6. Write audit log: `auth.email_verified`.
7. **Return `{ userId: UserId, isAdmin: boolean }`** from the loaded user — enables the route handler to create or refresh the session without a second DB call (covers both the case where no session exists and the case where the user is already logged in).

---

### New: `ResendVerificationEmailUseCase`

1. Look up user by session.
2. If `emailVerified` is true → no-op (return success silently).
3. Invalidate any existing verification tokens for the user (`emailVerificationTokenRepo.deleteByUserId`).
4. Create new `EmailVerificationToken` (reset expiry).
5. Send verification email.

Rate-limited by the API layer.

---

### New: `SendUserInvitationUseCase`

1. Verify actor `isAdmin` — return `PermissionDeniedError` if not.
2. Check if email is already registered (`userRepo.findByEmail`) — return `DuplicateEmailError` if so (this IS exposed to admin; enumeration protection only applies to public-facing registration).
3. Check if a pending, unexpired invitation already exists for this email — return `InvitationAlreadyPendingError` if so.
4. Generate raw token (32 bytes from `crypto.randomBytes`), compute SHA-256 hash.
5. Create `UserInvitation` entity, save it.
6. Send invitation email via `RegistrationInvitationNotifier`.
7. Write audit log: `user.invitation_sent`.

---

### New: `AcceptUserInvitationUseCase`

1. SHA-256 hash the raw token from the request.
2. Look up `UserInvitation` by `tokenHash`.
3. If not found, expired, or already accepted → return `InvalidTokenError`.
4. Validate display name (non-empty, max 100 chars) and password (policy + breach check).
5. Check email is still unregistered (race condition guard) — return `DuplicateEmailError` if taken.
6. Create `User` with `emailVerified = true` and `registrationMethod = 'INVITED'`, hash password, save.
7. Mark `UserInvitation.acceptedAt = now()`.
8. Create session for the new user (auto-sign-in after acceptance).
9. Write audit log: `user.invitation_accepted`.

---

### New: `ListUsersUseCase`

1. Verify actor `isAdmin` — return `PermissionDeniedError` if not.
2. Return all users (`userRepo.findAll()`) with fields needed for admin view.

No pagination in v1 (assumption: user count is small for self-hosted instances).

---

### New: `RemoveUserUseCase`

1. Verify actor `isAdmin` → `PermissionDeniedError` if not.
2. Verify actor is not removing themselves → `CannotRemoveSelfError`.
3. Verify target is not the last admin → `CannotRemoveLastAdminError` (if target is admin).
4. Find all projects where target is sole owner (`projectMemberRepo.findSoleOwnerProjects(targetId)`).
5. For each such project, add actor as owner member (`projectMemberRepo.addMember`).
6. Delete all target sessions (`sessionRepo.deleteByUserId(targetId)`).
7. Hard-delete target user (`userRepo.delete(targetId)`) — sessions, memberships, verification tokens cascade.
8. Write audit log: `user.removed`, including list of project IDs whose ownership was transferred.

---

### New: `SetAdminStatusUseCase`

1. Verify actor `isAdmin` → `PermissionDeniedError` if not.
2. Verify actor is not targeting themselves → `CannotModifySelfAdminError`.
3. If demoting: verify target is not the last admin → `CannotRemoveLastAdminError`.
4. Update `User.isAdmin` in the repository.
5. Write audit log: `user.admin_granted` or `user.admin_revoked`.

---

### Modified: `LoginUseCase` (extended return value)

`LoginResult` is extended to include `emailVerified: boolean` and `isAdmin: boolean`. The `user` object is already loaded during authentication; no extra DB call is required. The route handler uses these values to populate `session.emailVerified` and `session.isAdmin` at login time — this is the single point where session state is initialised for existing users. The live-DB check in each admin use case remains the authoritative enforcement for admin operations (per FR-013 and the Security Constitution).

---

### New: `GetOpenRegistrationUseCase`

Returns `boolean` from `systemSettingRepo.get("openRegistration")`. Used by the login page to show/hide the registration link.

---

### New: `SetOpenRegistrationUseCase`

1. Verify actor `isAdmin` → `PermissionDeniedError`.
2. Persist `systemSettingRepo.set("openRegistration", value)`.
3. Write audit log: `settings.open_registration_changed`.

---

## New Domain Errors

| Error Class | Used By | HTTP mapping |
|-------------|---------|-------------|
| `InvitationAlreadyPendingError` | `SendUserInvitationUseCase` | 409 |
| `CannotRemoveSelfError` | `RemoveUserUseCase` | 403 |
| `CannotModifySelfAdminError` | `SetAdminStatusUseCase` | 403 |
| `EmailNotVerifiedError` | API middleware | 403 |

*(Existing `CannotRemoveLastAdminError`, `InvalidTokenError`, `DuplicateEmailError`, `PermissionDeniedError` reused.)*

---

## State Transitions

### User.emailVerified

```
self-register ──► [emailVerified=false] ──► verify email ──► [emailVerified=true]
invited       ──► [emailVerified=true]  (from creation)
initial admin ──► [emailVerified=true]  (from creation)
```

### UserInvitation.status (derived)

```
created ──► [pending: !acceptedAt && !expired]
         ──► [accepted: acceptedAt != null]
         ──► [expired: now > expiresAt && !acceptedAt]
```
