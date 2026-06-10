# Phase 1 Data Model: Audit Log Coverage Review

## 1. `AuditLog` (existing — UNCHANGED)

No schema change. Reused for all governance events. For reference, the existing shape:

| Field | Type | Notes |
|-------|------|-------|
| id | UUID (PK) | domain-generated (`AuditLogId`) |
| userId | UUID? | FK → User, `onDelete: SetNull`. **Non-nullable in the domain entity** — governance events always have a known actor |
| projectId | UUID? | FK → Project. `null` for global/account actions |
| action | String | `<entity>.<verb>` (e.g. `auth.signed_in`) |
| resourceType | String | e.g. `User`, `FileNode`, `Project` |
| resourceId | String | target id |
| timestamp | DateTime | domain-provided (`new Date()`) |
| metadata | Json? | extension point — this feature stores `origin` (IP/UA) and before/after values here |

**This feature's use of `metadata`**: `origin: { ipAddress?, userAgent? }`, plus per-event before/after keys (`from`/`to`, `previousName`/`newName`, `previousEmail`/`newEmail`, `previousRole`/`newRole`, changed-fields for project update).

State: append-only, immutable (FR-019), retained indefinitely incl. after actor/target deletion (FR-020).

---

## 2. `FailedSignInAttempt` (NEW)

Coalesced, retention-bounded auth-failure telemetry. **Separate** from `AuditLog` (research D1).

### Domain entity — `packages/domain/src/entities/failed-sign-in-attempt.ts`

| Field | Type | Notes |
|-------|------|-------|
| id | `FailedSignInAttemptId` | domain-generated UUID |
| identifier | string | normalized, **validated email** attempted (research D4). Never the submitted secret |
| ipAddress | string | request origin; the sentinel `"unknown"` when unavailable (NOT NULL — see D2, keeps the coalescing key total) |
| userAgent | string \| null | client identifier, when available |
| windowStart | Date | start of the tumbling coalescing window (D2) |
| attemptCount | number | failures coalesced into this bucket (≥ 1) |
| firstAttemptAt | Date | first failure in the window |
| lastAttemptAt | Date | most recent failure in the window |

Immutable identity; `attemptCount`/`lastAttemptAt` advance via repository UPSERT (the entity is reconstructed, not mutated in place — consistent with the codebase's readonly-entity style).

### Prisma model — `packages/db/prisma/schema.prisma` (migration gated on user confirmation)

```prisma
model FailedSignInAttempt {
  id            String   @id @default(uuid()) @db.Uuid
  identifier    String
  ipAddress     String   // NOT NULL — sentinel "unknown" when origin is unavailable (D2)
  userAgent     String?
  windowStart   DateTime
  attemptCount  Int      @default(1)
  firstAttemptAt DateTime
  lastAttemptAt DateTime

  @@unique([identifier, ipAddress, windowStart])
  @@index([windowStart])
  @@index([identifier])
  @@index([ipAddress, windowStart])
}
```

**Notes**:
- No FK to `User` — attempts may target non-existent accounts (account-existence neutrality, FR-028).
- `@@unique([identifier, ipAddress, windowStart])` makes coalescing an atomic upsert (D2). `ipAddress` is **NOT NULL** and absent origins are stored as the sentinel `"unknown"`; this is required so PostgreSQL (which treats `NULL`s as distinct) still coalesces no-IP attempts — otherwise the bounded-volume invariant (FR-025/SC-008/INV-1) fails on the attacker-controlled path.
- `@@index([windowStart])` supports the purge `deleteOlderThan(cutoff)` (D6); the `identifier` / `(ipAddress, windowStart)` indexes also back the admin read filters (FR-032, D10).

State transitions: created on first failure in a window → incremented on subsequent failures in the same window → **deleted** by the scheduled purge once older than the retention window (D6). Never updated after purge eligibility.

---

## 3. `RequestContext` (NEW shared DTO) — `packages/shared/src/request-context.ts`

```ts
export interface RequestContext {
  readonly ipAddress?: string;
  readonly userAgent?: string;
}
```

Crosses the delivery→domain boundary carrying request origin (FR-017). Optional fields; absent for background/system-initiated actions.

---

## 4. New value object — `FailedSignInAttemptId`

Mirrors existing id value objects (`AuditLogId` etc.): extends `Uuid`, private constructor, `static create(value): FailedSignInAttemptId` with `validateUuid`.

---

## Relationships

```
User 1──* AuditLog            (existing; SetNull on delete)
Project 1──* AuditLog          (existing)
FailedSignInAttempt            (standalone — no FK; identifier is a free string)
RequestContext                 (transient DTO; not persisted on its own — folded into AuditLog.metadata)
```
