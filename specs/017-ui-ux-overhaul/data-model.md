# Data Model: UI/UX Overhaul

**Branch**: `017-ui-ux-overhaul` | **Date**: 2026-06-07

---

## Schema Changes

### 1. `User` — add `avatarKey` and `appTheme`

```prisma
model User {
  // ... existing fields ...
  avatarKey   String?             // nullable; null → default avatar rendered in frontend
  appTheme    String  @default("system")  // "light" | "dark" | "system"
}
```

**`avatarKey` constraints**:
- Stores a DiceBear style name: `"initial-face"` | `"bottts-neutral"` | `null`.
- No DB-level enum; API validates as `string | null` with a max-length guard only (style key enumeration is a frontend concern).
- `null` means the user has not chosen a style; the frontend defaults to `"initial-face"`.
- The avatar image is generated client-side by `@dicebear/core` using the user's display name as the deterministic seed — no image data is stored.

**`appTheme` constraints**:
- Allowed values: `"light"`, `"dark"`, `"system"`. Validated at the API boundary; default `"system"`.
- `"system"` means the OS/browser `prefers-color-scheme` is used at render time.
- Canonical store: database. A browser cookie (`asciidocollab-theme`) is written as a cache whenever the value changes, so the root layout can apply the correct CSS class before hydration without a DB round-trip.

**Propagation** (both fields):
- `packages/domain/src/entities/user.ts` → add `avatarKey: string | null`, `appTheme: string`
- `packages/shared/src/dtos/user-profile.dto.ts` → add `avatarKey: string | null`, `appTheme: string`
- `packages/infrastructure/src/persistence/user/user.repository.ts` → map both fields
- `apps/api/src/routes/profile-update.ts` → accept `avatarKey` and `appTheme` in the request body; validate both

---

### 2. `EditorPreferences` — add `softWrap`

```prisma
model EditorPreferences {
  // ... existing fields ...
  softWrap    Boolean  @default(true)
}
```

**Constraints**:
- Default `true` (soft wrap enabled) for all new records and for users who have never set a preference.
- Applied retroactively on read: records created before migration return `true` via the Prisma `@default`.

**Propagation**:
- `packages/domain/src/use-cases/settings/save-editor-preferences.ts` → accept and persist `softWrap`
- `packages/domain/src/use-cases/settings/get-editor-preferences.ts` → return `softWrap`
- `apps/api/src/routes/editor-preferences.ts` → include `softWrap` in GET response and PUT body schema
- `apps/web/src/hooks/use-editor-preferences.ts` → add `softWrap` to `EditorPrefs` type, state, and setter

---

## No Schema Change: AuditLog

The `AuditLog` model already contains all required columns:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `userId` | UUID? | Actor (nullable for system events) |
| `projectId` | UUID? | Affected project (nullable for global events) |
| `action` | String | Action type (e.g. `"USER_LOGIN"`, `"FILE_RENAMED"`) |
| `resourceType` | String | Affected resource type |
| `resourceId` | String | Affected resource identifier |
| `timestamp` | DateTime | When the event occurred |
| `metadata` | Json? | Arbitrary additional context |

Existing indexes on `userId` and `projectId` support filtered queries. An additional index on `(action, timestamp)` may be added at the infrastructure layer for efficient action-type + date-range queries without a schema migration (Prisma index).

---

## Extended Domain Interfaces

### `AuditLogRepository` — new methods

```typescript
interface AuditLogFilters {
  fromDate?: Date;
  toDate?: Date;
  userId?: string;
  actionType?: string;
}

interface PaginationOptions {
  page: number;   // 1-based
  limit: number;  // default 50
}

interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// New methods added to AuditLogRepository:
findWithFilters(filters: AuditLogFilters, pagination: PaginationOptions): Promise<PagedResult<AuditLog>>;
findDistinctActionTypes(): Promise<string[]>;
```

---

## Entities — No New Domain Entities

All data for this feature maps to existing domain entities (`User`, `EditorPreferences`, `AuditLog`, `FileNode`). No new entity classes are required.

---

## Frontend State — Avatar Style Registry

```typescript
// apps/web/src/lib/avatars.ts
// Install: @dicebear/core + @dicebear/collection
import { initialFace } from '@dicebear/collection';   // CC0 1.0
import { botttsNeutral } from '@dicebear/collection'; // Free commercial use

export const DICEBEAR_STYLES = {
  'initial-face':   { style: initialFace,   label: 'Initial Face' },
  'bottts-neutral': { style: botttsNeutral, label: 'Bottts Neutral' },
} as const;

export type AvatarStyleKey = keyof typeof DICEBEAR_STYLES;
export const DEFAULT_AVATAR_STYLE: AvatarStyleKey = 'initial-face';
```

**Design invariants**:
- The avatar picker iterates `Object.entries(DICEBEAR_STYLES)` — it never references style names directly.
- Adding a new DiceBear style = install package + add one entry to `DICEBEAR_STYLES`. Picker updates automatically.
- Avatar rendering always uses `user.displayName` as the seed → same avatar everywhere for the same user.
- `avatarKey` in DB stores the style key string (or `null` → resolved to `DEFAULT_AVATAR_STYLE` at render time).

---

## Frontend State — Theme

```typescript
// apps/web/src/hooks/use-theme.ts
type Theme = 'light' | 'dark' | 'system';

interface UseThemeResult {
  theme: Theme;                      // user's saved preference (from DB, loaded via profile API)
  resolvedTheme: 'light' | 'dark';   // actual applied theme after resolving "system"
  setTheme: (theme: Theme) => void;  // saves to DB + writes cookie cache
}
```

**Cookie (cache only)**:
- Name: `asciidocollab-theme` | Max age: 1 year | SameSite: Lax | Path: /
- Written: whenever `setTheme()` is called (alongside the DB write)
- Read: by Next.js root layout (server component) to set `<html class>` before hydration
- Authority: DB wins after hydration for authenticated users

## Extended Storage Port

```typescript
// packages/domain/src/ports/storage/project-file-store.ts — new method
readStream(projectId: ProjectId, filePath: FilePath): Promise<Readable | null>;
```

Used exclusively by the ZIP download endpoint. The filesystem implementation returns `fs.createReadStream(path)`; the in-memory test fake returns `Readable.from(storedBuffer)`. This ensures the ZIP endpoint never loads a complete file into memory — it only holds the bytes currently flowing through the pipe.
