# Research: UI/UX Overhaul

**Branch**: `017-ui-ux-overhaul` | **Date**: 2026-06-07

---

## 1. Dark Mode — Tailwind v4 + DB-Canonical + Cookie Cache

**Decision**: Class-based dark mode via `darkMode: 'class'` in `tailwind.config.ts`. Theme preference stored in the database on the `User` row as `appTheme String @default("system")`. A browser cookie (`asciidocollab-theme`) serves as a write-through cache that seeds the `<html class>` on server-side render to prevent flash-of-wrong-theme; the database value is the canonical store for authenticated users.

**Flow**:
1. On theme change: update DB via `PATCH /auth/me/profile` (with `appTheme`) → simultaneously write cookie (SameSite=Lax, 1-year, Path=/) for fast SSR re-use.
2. On page load (authenticated): Next.js root layout reads cookie for immediate HTML class; after hydration, `ThemeProvider` confirms/corrects from the profile API response.
3. On page load (unauthenticated): root layout reads cookie; if absent, `ThemeProvider` falls back to `window.matchMedia('(prefers-color-scheme: dark)')`.

**Rationale**:
- The `.dark {}` CSS variable block already exists in `globals.css` — all 20+ shadcn/ui design tokens have dark-mode values. Zero new CSS variables needed.
- DB storage means theme is consistent across browsers and devices (per spec FR-003). Cookie avoids a visible flash on hard refresh without adding a full round-trip to the critical render path.
- Cookie is a cache, not the source of truth: if cookie and DB diverge (e.g., user cleared cookies), the DB wins after hydration.

**Alternatives considered**:
- `next-themes`: rejected — adds a client boundary around the root layout, conflicts with App Router's server-first model.
- Cookie-only (no DB): rejected — preference would be lost when cookies are cleared and would not sync across devices, violating spec FR-003.

---

## 2. User Avatar — DiceBear Style Key + Dynamic Style Registry

**Decision**: Use [DiceBear](https://www.dicebear.com/) with two initial styles — **Initial Face** (CC0 1.0) and **Bottts Neutral** (free for personal and commercial use). The DB column `avatarKey String?` stores the chosen DiceBear *style name* (e.g. `"initial-face"` or `"bottts-neutral"`), not a specific image ID. Avatars are generated client-side via `@dicebear/core` using the user's display name as the deterministic seed.

**Style registry** (`apps/web/src/lib/avatars.ts`):
```typescript
import { initialFace } from '@dicebear/collection';
import { botttsNeutral } from '@dicebear/collection';

export const DICEBEAR_STYLES = {
  'initial-face': { style: initialFace, label: 'Initial Face' },
  'bottts-neutral': { style: botttsNeutral, label: 'Bottts Neutral' },
} as const;

export type AvatarStyleKey = keyof typeof DICEBEAR_STYLES;
export const DEFAULT_AVATAR_STYLE: AvatarStyleKey = 'initial-face';
```

The avatar picker iterates `Object.entries(DICEBEAR_STYLES)` — it has no knowledge of which styles exist. Adding a new style requires only installing the package and adding one entry to this registry; the picker updates automatically.

**Rendering**:
```typescript
import { createAvatar } from '@dicebear/core';
const svg = createAvatar(DICEBEAR_STYLES[avatarKey ?? DEFAULT_AVATAR_STYLE].style, {
  seed: user.displayName,
}).toString();
```

**API validation**: `avatarKey` is validated server-side as `string | null` with a max-length guard only. The API does not enumerate allowed style keys — that is a frontend concern. This decouples the backend from frontend library choices; unknown style keys simply fall back to the default at render time.

**Packages** (installed in `apps/web`):
- `@dicebear/core` — core generator (MIT)
- `@dicebear/collection` — all official styles including `initial-face` (CC0) and `bottts-neutral` (free commercial use)

**Licenses**:
- Initial Face: [CC0 1.0](https://www.dicebear.com/styles/initial-face/) — public domain, no attribution
- Bottts Neutral: [Free for personal and commercial use](https://www.dicebear.com/styles/bottts-neutral/) — custom free license
- DiceBear code: MIT

**Rationale**:
- No file uploads, no blob storage, no CDN calls at runtime — avatars are generated entirely client-side.
- Using the display name as seed means the avatar is always personal and consistent for each user without storing image data.
- The registry pattern means the picker never needs to be modified when styles are added or removed — it discovers them from the registry automatically.

**Alternatives considered**:
- Hardcoded list of preset SVG icons (e.g. `"owl"`, `"fox"`): rejected — requires manual design work, no dynamic discovery.
- Storing avatar index (integer): rejected — not resilient to reordering.
- Separate `UserAvatar` table: rejected — unnecessary for a single string column.

---

## 3. True Streaming ZIP — archiver.js + ProjectFileStore readStream()

**Decision**: Use the `archiver` npm package with `archiver.append(readableStream, { name })` to build the ZIP. Each file is read as a `Readable` stream from a new `readStream()` method on `ProjectFileStore`, piped directly into archiver, which pipes to `reply.raw`. No intermediate ZIP file is written anywhere; no file content is loaded into memory as a buffer.

**Memory model**: At any point in time, only the bytes currently flowing through the pipe for one file occupy memory (typically a few KB of kernel/archiver buffers). Total memory consumed is O(single-file-chunk), not O(project-size).

**Required port change**: `ProjectFileStore` currently exposes only `read() → Promise<Buffer | null>`. A new method is added:
```typescript
readStream(projectId: ProjectId, filePath: FilePath): Promise<Readable | null>;
```
The filesystem implementation (`FsProjectFileStore`) returns `fs.createReadStream(absolutePath)`. The in-memory fake returns a `Readable` built from the stored buffer (e.g. `Readable.from(buffer)`).

**Integration with Fastify**:
```
archiver.pipe(reply.raw)
for each file:
  const stream = await fileStore.readStream(projectId, path)
  archiver.append(stream, { name: relativePath })
archiver.finalize()
```
Fastify's `reply.raw` is the underlying `http.ServerResponse` (a `Writable`). Setting `Content-Type: application/zip` and `Content-Disposition: attachment; filename="..."` before piping is sufficient.

**ZIP filename pattern**: `<project-name>-<YYYY-MM-DD>.zip` (per clarification Q5).

**Alternatives considered**:
- `jszip`: assembles the entire archive in memory — rejected (violates spec FR-028).
- `archiver.append(buffer)` (using existing `read()` method): loads the full file into memory before appending — rejected for the same reason.
- Node.js built-in `zlib`: no ZIP format support, only gzip/deflate — rejected.

---

## 4. Drag-and-Drop — HTML5 Native DnD API

**Decision**: Use the browser's native HTML5 Drag and Drop API (`draggable`, `dragstart`, `dragover`, `drop` events) for the file tree reorganisation, coordinated by a React context holding drag state.

**Rationale**:
- `MoveFileUseCase` already exists in the domain layer and handles the actual move including cascading path updates for folders. The frontend only needs to collect the source node ID and destination folder ID, then call the existing `POST /projects/:id/files/:fileNodeId/move` API (or the equivalent).
- The file-tree components (`file-tree.tsx`, `file-tree-node.tsx`) are plain React; native DnD slots in without a library dependency.
- `drag-drop-zone.tsx` already exists in the file-tree component directory (used for file uploads); its patterns serve as a reference.
- Name-conflict handling: before calling the move API, the frontend checks whether the destination folder already contains a node with the same name (data available from the in-memory tree state). If conflict detected, the confirmation dialog surfaces two options: Cancel or Rename (auto-append numeric suffix).

**Alternatives considered**:
- `@dnd-kit/core`: powerful, accessible — not currently installed and adds ~15 kB. Native HTML5 DnD is sufficient for a tree with typical project sizes (<1000 nodes).
- `react-beautiful-dnd`: deprecated. Rejected.

---

## 5. Audit Log — Pagination + Filter Extension

**Decision**: Extend `AuditLogRepository` (domain port) with a new `findWithFilters` method that accepts `{ fromDate?, toDate?, userId?, actionType?, page, limit }` and returns `{ entries: AuditLog[], total: number }`. The infrastructure implementation uses Prisma `where` clauses with optional conditions. A separate `findDistinctActionTypes()` method populates the filter dropdown.

**Rationale**:
- The existing `AuditLog` Prisma model has `action` (string), `userId`, `timestamp`, and indexes on `userId` and `projectId`. Filtering and pagination can be implemented as a pure Prisma query — no schema change needed for the audit log itself.
- `findDistinctActionTypes()` executes a `SELECT DISTINCT action FROM audit_logs` query and returns an array of strings. The frontend renders these as a dropdown (per clarification Q3).
- Page size defaults to 50 per page.

**Alternatives considered**:
- Cursor-based pagination: better for infinite scroll — rejected because spec uses traditional pagination (page/limit).
- Full-text search on `action` field: overkill — dropdown of distinct values covers the use case.

---

## 6. Soft Wrap — EditorPreferences Schema Extension (DB-canonical)

**Decision**: Add `softWrap Boolean @default(true)` to the `EditorPreferences` Prisma model and propagate through the existing preferences stack (use case → API route → `useEditorPreferences` hook → `EditorSettingsPanel`).

**Rationale**:
- `EditorPreferences` already stores `fontSize`, `theme`, and `scrollSyncEnabled` with server-persist (DB) + localStorage-cache pattern. `softWrap` follows the exact same path — DB is the canonical store, localStorage is a fast client-side cache.
- Default `true` matches the spec requirement (soft wrap on by default for all users).
- CodeMirror 6 soft wrap is toggled via `EditorView.lineWrapping` extension — added/removed from the extension array based on the preference value.
- No cookie involvement: the existing pattern uses localStorage as the local cache (not cookies), which is fine for editor-specific preferences that don't need to survive across domains or SSR.

---

## 7. Admin System Settings Page — Frontend Only

**Decision**: The admin system settings API (`GET /admin/settings`, `PATCH /admin/settings`) already exists and handles `openRegistration` and `maxUploadSizeBytes`. Only a new frontend page is needed at `apps/web/src/app/(dashboard)/dashboard/admin/settings/page.tsx`.

**Rationale**:
- No new API work required. The backend already exposes all relevant system settings.
- The page pattern mirrors the existing account settings cards (e.g. `open-registration-card.tsx`, `upload-size-card.tsx`).
