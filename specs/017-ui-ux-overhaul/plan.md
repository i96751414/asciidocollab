# Implementation Plan: UI/UX Overhaul — Editor Options, Downloads, Dark Mode & User Menu

**Branch**: `017-ui-ux-overhaul` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-ui-ux-overhaul/spec.md`

---

## Summary

Eight user stories spanning four concern areas — dark mode theming, a unified user avatar menu, editor soft-wrap, file/project downloads, tree drag-and-drop, admin audit log, and admin system settings page. All domain logic is additive (no rewrites); the primary work is UI composition, two new Prisma columns, two new API endpoints, one extended repository interface, and three new admin/download pages.

---

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+ for API, browser targets for frontend)

**Primary Dependencies**:
- Frontend: Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui + Radix UI, CodeMirror 6
- Backend: Fastify, Prisma ORM, `archiver` (new — streaming ZIP)
- Monorepo: pnpm workspaces

**Storage**: PostgreSQL via Prisma. File content via `ProjectFileStore` (existing storage port).

**Testing**: Jest + Testing Library (unit/integration); Playwright (E2E)

**Target Platform**: Web — SSR via Next.js App Router + Fastify REST API

**Performance Goals**:
- ZIP stream: first byte within 500 ms for typical projects; bounded memory per the streaming constraint
- Audit log page load: < 3 s to display first page of results (SC-004)
- Theme switch: immediate (no reload), < 2 s (SC-001)

**Constraints**:
- Streaming ZIP: no intermediate files on disk; memory scales with largest individual file
- Tailwind dark mode must not cause flash-of-wrong-theme on hard refresh (requires server-side cookie read)
- Soft-wrap preference: cookie OR server-side (EditorPreferences DB record — chosen path)
- Prisma schema migrations require explicit user confirmation before running (per Architecture Constitution)

**Scale/Scope**: Single-tenant deployment; typical project < 1,000 file nodes; audit log may grow to 10 k+ entries over time.

---

## Constitution Check

### Governance Constitution

| Principle | Status | Notes |
|-----------|--------|-------|
| Clean Code — names reveal intent | ✅ Pass | All new symbols follow existing naming conventions |
| TDD — Red-Green-Refactor | ✅ Pass | In-memory fakes required for new `findWithFilters` + `findDistinctActionTypes` repository methods |
| Seam testing with in-memory fakes | ✅ Pass | Extended `AuditLogRepository` requires in-memory fake update in `packages/domain/tests/ports/admin/` |
| Commit discipline | ✅ Pass | One logical change per commit; Conventional Commits format |
| Quality gates | ✅ Pass | `pnpm lint` + `pnpm typecheck` + unit tests before every commit |

### Architecture Constitution

| Rule | Status | Notes |
|------|--------|-------|
| Domain has zero external dependencies | ✅ Pass | No new imports into `packages/domain` from infrastructure or delivery |
| RBAC in use cases | ⚠️ Action required | Audit log and avatar use cases check role ✅. Download endpoints need `DownloadFileUseCase` / `DownloadProjectUseCase` to perform membership checks in the domain layer (see Security section below). |
| Result<T,E> for fallible operations | ✅ Pass | All new use cases return `Result<T, DomainError>` |
| Prisma migration policy | ⚠️ Action required | Two new columns (`User.avatarKey`, `EditorPreferences.softWrap`) require a migration. **Agent must ask user before generating or running migration scripts.** |
| Tests in `tests/` directory (no `__tests__/`) | ✅ Pass | All test paths use `tests/` root |
| Cross-package types in `packages/shared` | ✅ Pass | `AuditLogDto` and updated `UserProfileDto` defined in shared |

### Security Constitution

| Rule | Status | Notes |
|------|--------|-------|
| RBAC at use-case boundary | ⚠️ Action required | Audit log: use case verifies admin role ✅. Downloads: new `DownloadFileUseCase` and `DownloadProjectUseCase` added to Phase F to perform membership verification and IDOR checks in the domain layer; routes must not contain access-control logic. Admin page guards: server component `redirect('/dashboard')` added to Phase C/D for FR-019 and FR-034. |
| Input validation at boundary | ✅ Pass | Fastify schema validation on all new routes; avatar key validated against allow-list |
| No information leaks in error responses | ✅ Pass | Domain errors mapped to safe HTTP responses via existing error handler |
| Cookie security | ✅ Pass | Theme cookie: `SameSite=Lax`, `Path=/`, 1-year max-age. No sensitive data. |
| Rate limiting | ⚠️ Action required | FR-044/FR-045 require per-IP rate limiting on download and audit-log endpoints. All rate limits MUST follow the established convict pattern: values read from `app.config.*`, defined in `apps/api/src/config/schema.ts`, with env var overrides and per-environment YAML defaults. New config paths: `downloads.zip.*`, `downloads.file.*`, `admin.auditLog.*`. Env vars: `ASCIIDOCOLLAB_DOWNLOADS_ZIP_RATE_LIMIT_MAX/WINDOW`, `ASCIIDOCOLLAB_DOWNLOADS_FILE_RATE_LIMIT_MAX/WINDOW`, `ASCIIDOCOLLAB_ADMIN_AUDIT_LOG_RATE_LIMIT_MAX/WINDOW`. `@fastify/rate-limit` is already installed; plugin registered with `global: false` — each route opts in via `config: { rateLimit: { max: app.config.X.rateLimitMax, timeWindow: app.config.X.rateLimitWindow } }`. |
| IDOR protection | ⚠️ Action required | FR-042: file download use case must verify `fileNode.projectId == projectId`. FR-043: `MoveFileUseCase` must validate `newParentId` belongs to same project (or verify this already exists). |
| Authorization denial logging | ⚠️ Action required | FR-019/FR-034 require logging of non-admin URL access attempts. Verify `requireAdmin` preHandler logs denials; if not, add explicit logging call. |

---

## Project Structure

### Documentation (this feature)

```text
specs/017-ui-ux-overhaul/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── api-endpoints.md # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code Changes

```text
packages/db/prisma/
└── schema.prisma                         MODIFY — add avatarKey + appTheme to User, softWrap to EditorPreferences

packages/domain/src/
├── entities/user.ts                      MODIFY — add avatarKey: string | null, appTheme: string
├── ports/storage/project-file-store.ts   MODIFY — add readStream(): Promise<Readable | null>
├── ports/admin/audit-log.repository.ts   MODIFY — add findWithFilters(), findDistinctActionTypes()
├── use-cases/settings/
│   ├── get-editor-preferences.ts         MODIFY — return softWrap
│   └── save-editor-preferences.ts        MODIFY — accept and persist softWrap
├── use-cases/admin/
│   └── list-audit-logs.ts                NEW — admin list with filters + pagination
└── use-cases/project/
    ├── download-file.ts                  NEW — verify membership + IDOR (fileNode.projectId == projectId), ensure FILE type, return path
    └── download-project.ts               NEW — verify membership, return FILE node list + relative paths + project name for ZIP

packages/domain/tests/ports/admin/
└── audit-log.repository.fake.ts          MODIFY — implement findWithFilters(), findDistinctActionTypes()

packages/shared/src/dtos/
├── user-profile.dto.ts                   MODIFY — add avatarKey: string | null
└── audit-log.dto.ts                      NEW — AuditLogDto, AuditLogPageDto, AuditLogFiltersDto

packages/infrastructure/src/persistence/
├── user/user.repository.ts               MODIFY — map avatarKey
└── admin/audit-log.repository.ts         MODIFY — implement findWithFilters(), findDistinctActionTypes()

apps/api/src/routes/
├── profile-update.ts                     MODIFY — accept avatarKey in body
├── editor-preferences.ts                 MODIFY — include softWrap in GET + PUT
├── projects/download.ts                  NEW — streaming ZIP endpoint
├── files/download.ts                     NEW — individual file download endpoint
└── admin/audit-logs.ts                   NEW — list audit logs + action-types endpoints

apps/web/src/
├── app/
│   ├── layout.tsx                        MODIFY — read theme cookie server-side, apply to <html>
│   └── (dashboard)/
│       ├── layout.tsx                    MODIFY — remove sidebar, replace header controls with UserMenu
│       └── dashboard/
│           ├── account/
│           │   └── display-name-card.tsx MODIFY — add avatar picker field
│           └── admin/
│               ├── audit-log/
│               │   └── page.tsx          NEW — audit log browser page
│               └── settings/
│                   └── page.tsx          NEW — system settings UI page
├── components/
│   ├── user-menu.tsx                     NEW — user button + dropdown
│   ├── avatar.tsx                        NEW — avatar display component
│   ├── theme-provider.tsx                NEW — client ThemeProvider + OS detection
│   ├── file-tree/
│   │   ├── file-tree.tsx                 MODIFY — DnD context + drop handlers
│   │   ├── file-tree-node.tsx            MODIFY — draggable, drop target, Download menu item
│   │   └── file-tree-actions.tsx         MODIFY — Download action (files) + Download ZIP (root node)
│   └── editor/
│       └── editor-settings-panel.tsx     MODIFY — add soft-wrap toggle
├── hooks/
│   ├── use-editor-preferences.ts         MODIFY — add softWrap state + setter
│   └── use-theme.ts                      NEW — theme hook (reads/writes cookie + DOM class)
├── lib/
│   └── avatars.ts                        NEW — DICEBEAR_STYLES registry + DEFAULT_AVATAR_STYLE; picker derives options dynamically
└── styles/
    └── globals.css                       MODIFY — confirm .dark {} CSS vars are present (already are)

apps/web/tailwind.config.ts               MODIFY — add darkMode: 'class'
```

**Structure Decision**: Web application layout. All changes are additive to the existing `apps/web` + `apps/api` structure. No new packages or apps required.

---

## Implementation Phases

### Phase A: Dark Mode Infrastructure (P1 — unblocks all subsequent UI work)

All other stories render in either light or dark theme; this phase must ship first.

**DB changes** (confirm migration with user before running):
1. **Schema** — add `appTheme String @default("system")` and `avatarKey String?` to `User` model (combined with Phase B migration — one migration script for both columns)
2. **`packages/domain/src/entities/user.ts`** — add `appTheme: string` field
3. **`packages/shared/src/dtos/user-profile.dto.ts`** — add `appTheme: string`
4. **`packages/infrastructure/src/persistence/user/prisma-user.repository.ts`** — map `appTheme`
5. **`packages/domain/src/use-cases/auth/update-profile.ts`** — create `UpdateProfileUseCase` accepting `{ userId, displayName?, avatarKey?, appTheme? }`: validates `appTheme` against `["light", "dark", "system"]` if provided; persists all provided fields via `UserRepository`. All new profile mutations MUST route through this use case. (The existing `UpdateDisplayNameUseCase` is kept for backwards-compatibility with its existing tests and MUST NOT be extended further.)
6. **`apps/api/src/routes/profile-update.ts`** — **URL fix**: re-register at `/auth/me/profile` (was `/auth/profile` — inconsistent with `/auth/me/editor-preferences`); accept `displayName`, `appTheme`, and `avatarKey` in body; validate `appTheme` enum via Fastify schema; call `UpdateProfileUseCase`

**Frontend**:
6. **`tailwind.config.ts`** — add `darkMode: 'class'`
7. **`globals.css`** — verify `.dark {}` CSS variable block is complete (already present)
8. **`apps/web/src/hooks/use-theme.ts`** — `useTheme()` hook:
   - Reads initial value from the user profile (DB-authoritative)
   - On `setTheme(t)`: calls `PATCH /auth/me/profile` with `{ appTheme: t }`, then writes cookie `asciidocollab-theme` as cache, then toggles `document.documentElement.classList`
   - For unauthenticated pages: falls back to cookie → then `window.matchMedia('(prefers-color-scheme: dark)')`
9. **`apps/web/src/components/theme-provider.tsx`** — client component: reads profile on mount to confirm/correct DB value; exposes theme context
10. **`apps/web/src/app/layout.tsx`** — read `asciidocollab-theme` cookie server-side (`cookies()`), apply `class="dark"` or `class=""` to `<html>` for FOUT prevention; DB value corrects on hydration

**Tests**:
- `apps/web/tests/hooks/use-theme.test.ts` — setTheme calls API + writes cookie; OS preference used when no cookie and unauthenticated; DB value wins after load

---

### Phase B: User Avatar Menu + Remove Side Panel (P1)

**New packages** (install in `apps/web`): `@dicebear/core`, `@dicebear/collection`
- Initial Face: https://www.dicebear.com/styles/initial-face/ (CC0 1.0)
- Bottts Neutral: https://www.dicebear.com/styles/bottts-neutral/ (free commercial use)

**DB changes** — combined into the same Prisma migration as Phase A (`appTheme`):
1. **Schema** — `avatarKey String?` already included in the Phase A migration script
2. **`packages/shared`** — add `avatarKey: string | null` to `UserProfileDto`
3. **`packages/domain`** — update `User` entity to include `avatarKey: string | null`; `UpdateProfileUseCase` (step A.5 / task T083) already accepts `avatarKey: string | null` (max 50 chars, no style enumeration server-side) — no additional use case changes needed in this phase
4. **`packages/infrastructure/src/persistence/user/prisma-user.repository.ts`** — update mapper to read and write `avatarKey`; `appTheme` already mapped in Phase A

**Backend**:
5. **`apps/api`** — extend `PATCH /auth/me/profile` body schema to include `avatarKey: string | null` (max-length validation only)

**Frontend**:
6. **`apps/web/src/lib/avatars.ts`** — define `DICEBEAR_STYLES` registry (see data-model.md); `DEFAULT_AVATAR_STYLE = 'initial-face'`. The picker derives available options from `Object.entries(DICEBEAR_STYLES)` — no style names are referenced elsewhere in the codebase
7. **`apps/web/src/components/avatar.tsx`** — generates avatar SVG via `createAvatar(DICEBEAR_STYLES[key ?? DEFAULT_AVATAR_STYLE].style, { seed: displayName })`, renders as `<img src="data:image/svg+xml,...">` or inline SVG; unknown/null key falls back to `DEFAULT_AVATAR_STYLE`
8. **`apps/web/src/components/user-menu.tsx`** — user button (username + `<Avatar>` component) + Radix `DropdownMenu` with sections in FR-006 order: Account, Settings, [Administrator Settings (admin only: Users, System Settings)], [Audit Log (admin only — separate section)], GitHub, Log Out
9. **`apps/web/src/app/(dashboard)/layout.tsx`** — remove sidebar `<div>`, replace Account/Sign-Out/username controls with `<UserMenu>`, add `ThemeProvider` wrapper
10. **`apps/web/src/app/(dashboard)/dashboard/account/display-name-card.tsx`** — add avatar style picker: iterates `Object.entries(DICEBEAR_STYLES)`, renders a preview for each style using the user's current display name as seed, highlights the active selection; on save, PATCHes `avatarKey` alongside `displayName`

**Tests**:
- `apps/web/tests/components/user-menu.test.tsx` — renders admin items only for admin users; dropdown opens/closes; GitHub link has `target="_blank"`
- `apps/web/tests/components/avatar.test.tsx` — renders SVG for a known style key; falls back to `DEFAULT_AVATAR_STYLE` for null/unknown key; seed changes produce different output

---

### Phase C: Admin Audit Log (P2)

1. **`packages/domain/src/ports/admin/audit-log.repository.ts`** — add `findWithFilters()` and `findDistinctActionTypes()` method signatures
2. **`packages/domain/tests/ports/admin/in-memory-audit-log.repository.ts`** — implement new methods in the in-memory fake (filter by all four criteria; paginate)
3. **`packages/domain/src/use-cases/admin/list-audit-logs.ts`** — new use case: validates actor is admin, calls `findWithFilters()`, returns `PagedResult<AuditLog>`
4. **`packages/shared/src/dtos/audit-log.dto.ts`** — `AuditLogDto`, `AuditLogPageDto`
5. **`packages/infrastructure/src/persistence/admin/prisma-audit-log.repository.ts`** — implement `findWithFilters()` (Prisma `where` + `skip`/`take`) and `findDistinctActionTypes()` (Prisma `groupBy` or raw `SELECT DISTINCT`)
6. **`apps/api/src/routes/admin/audit-logs.ts`** — register `GET /admin/audit-logs` and `GET /admin/audit-logs/action-types` with `requireAdmin` preHandler; apply per-IP rate limiting (FR-045) via `config: { rateLimit: { max: app.config.admin.auditLog.rateLimitMax, timeWindow: app.config.admin.auditLog.rateLimitWindow } }` — env vars: `ASCIIDOCOLLAB_ADMIN_AUDIT_LOG_RATE_LIMIT_MAX/WINDOW`; defaults: 120 req / 60 s
7. **`apps/web/src/lib/admin-guard.ts`** — create `requireAdminOrRedirect(resourcePath: string): Promise<void>` server-side helper: reads session from cookies; if `!isAdmin`, fires `POST /admin/access-denied` (server-side fetch with session cookie forwarded) to record denial in `AuditLog` with `action: 'UNAUTHORIZED_PAGE_ACCESS'`, then calls `redirect('/dashboard')`. Shared by both admin pages to satisfy FR-019/FR-034 logging requirement.
8. **`apps/api/src/routes/admin/access-denied.ts`** — register `POST /admin/access-denied` with `requireAuth` preHandler; accepts `{ resource: string }` body; saves `AuditLog { action: 'UNAUTHORIZED_PAGE_ACCESS', resourceType: 'PAGE', resourceId: resource, userId: session.userId }` via `AuditLogRepository.save()`; returns `204 No Content`; register in `apps/api/src/index.ts`
9. **`apps/web/src/app/(dashboard)/dashboard/admin/audit-log/page.tsx`** — server component: call `requireAdminOrRedirect('/dashboard/admin/audit-log')` at the top (FR-019 — logs denial + redirects if not admin); table with columns: timestamp, actor, action type, resource type, resource ID; filter bar: date range picker, user dropdown, action type dropdown; pagination controls

**Tests**:
- `packages/domain/tests/use-cases/admin/list-audit-logs.test.ts` — filters each dimension; AND logic; pagination; admin-only gate
- `packages/infrastructure/tests/persistence/admin/audit-log.repository.test.ts` — integration test against real DB (testcontainers); verifies `findWithFilters()` and `findDistinctActionTypes()` with actual data
- `apps/web/tests/app/admin/audit-log.test.tsx` — renders entries; applying filter updates query params; empty state shown; non-admin session triggers redirect

---

### Phase D: Administrator System Settings Page (P2)

The API already exists. Only frontend work:

1. **`apps/web/src/app/(dashboard)/dashboard/admin/settings/page.tsx`** — server component: call `requireAdminOrRedirect('/dashboard/admin/settings')` (from `apps/web/src/lib/admin-guard.ts`, FR-034 — logs denial + redirects if not admin); form cards for:
   - Open Registration toggle (boolean)
   - Max Upload Size (number input, bytes, with human-readable display)
   Reads via `GET /admin/settings`, writes via `PATCH /admin/settings`

**Tests**:
- `apps/web/tests/app/admin/settings.test.tsx` — form renders values; submit sends correct PATCH body; non-admin session triggers redirect

---

### Phase E: Editor Soft Wrap (P2)

Storage: DB via `EditorPreferences` (same pattern as fontSize, editor theme, scrollSync — localStorage used as a fast local cache, DB is canonical).

1. **Schema** — add `softWrap Boolean @default(true)` to `EditorPreferences` (user confirms migration before running)
2. **`packages/domain/src/use-cases/settings/save-editor-preferences.ts`** — add `softWrap` to input type and persistence call
3. **`packages/domain/src/use-cases/settings/get-editor-preferences.ts`** — return `softWrap`
4. **`apps/api/src/routes/editor-preferences.ts`** — add `softWrap` to GET response and PUT body schema
5. **`apps/web/src/hooks/use-editor-preferences.ts`** — add `softWrap: boolean` to `EditorPrefs` (default `true`), localStorage key, setter `setSoftWrap`; PUT payload includes `softWrap`
6. **`apps/web/src/components/editor/editor-settings-panel.tsx`** — add a toggle labelled "Soft Wrap" positioned after the Theme selector
7. **`apps/web/src/components/editor/asciidoc-editor.tsx`** — conditionally include `EditorView.lineWrapping` in the CodeMirror extension array based on `softWrap`

**Tests**:
- `packages/domain/tests/use-cases/settings/save-editor-preferences.test.ts` — softWrap persisted; default true
- `apps/web/tests/hooks/use-editor-preferences.test.ts` — softWrap included in initial load and PUT payload; localStorage cache updated
- `apps/web/tests/components/editor/editor-settings-panel.test.tsx` — toggle renders; fires `setSoftWrap`

---

### Phase F: File Downloads (P3)

**Important — true streaming ZIP** (see research.md §3): archiver receives `Readable` streams (not buffers). `ProjectFileStore` needs a new `readStream()` method.

**Security requirement**: Membership verification and IDOR protection MUST live in domain use cases, not route handlers (Security Constitution RBAC rule + FR-042).

1. **`packages/domain/src/ports/storage/project-file-store.ts`** — add `readStream(projectId, filePath): Promise<Readable | null>`
2. **Infrastructure implementation** (`FsProjectFileStore`) — implement `readStream()` via `fs.createReadStream(absolutePath)`
3. **In-memory test fake** — implement `readStream()` via `Readable.from(storedBuffer)`
4. **`packages/domain/src/use-cases/project/download-file.ts`** — NEW use case:
   - Input: `{ projectId, fileNodeId, requestingUserId }`
   - Verify `requestingUserId` is a member of `projectId`
   - Look up `fileNode` where `id = fileNodeId AND projectId = projectId` (IDOR guard: returns `NotFoundError` if not found in this project — FR-042)
   - Verify `fileNode.type === 'FILE'` (return `ValidationError` if folder)
   - Return `Result<{ fileNode: FileNode; filePath: FilePath }, PermissionDeniedError | NotFoundError | ValidationError>`
5. **`packages/domain/src/use-cases/project/download-project.ts`** — NEW use case:
   - Input: `{ projectId, requestingUserId }`
   - Verify `requestingUserId` is a member of `projectId`
   - Fetch project metadata (name) and all `FILE` nodes with relative paths
   - Return `Result<{ projectName: string; files: Array<{ relativePath: string; filePath: FilePath }> }, PermissionDeniedError | NotFoundError>`
6. **Individual file** — `apps/api/src/routes/files/download.ts`:
   - `GET /projects/:projectId/files/:fileNodeId/download`
   - Call `DownloadFileUseCase`; map errors to HTTP responses (403/404/400)
   - On success: call `fileStore.readStream()`; pipe to `reply.raw`; set `Content-Disposition: attachment; filename="<name>"`
7. **ZIP download** — `apps/api/src/routes/projects/download.ts`:
   - `GET /projects/:projectId/download`
   - Call `DownloadProjectUseCase`; map errors to HTTP responses (403/404)
   - On success: create `archiver.create('zip')`, pipe to `reply.raw`; set `Content-Type: application/zip` and `Content-Disposition: attachment; filename="<project-name>-<YYYY-MM-DD>.zip"` (date computed from server UTC time)
   - For each file: `const stream = await fileStore.readStream(...); archive.append(stream, { name: relativePath })`
   - Call `archive.finalize()` — archiver drains each stream in order; at any moment only current file's in-flight bytes occupy memory
8. **Rate limiting** (FR-044) — apply per-IP rate limiting to both download routes via the established convict pattern:
   - ZIP route: `config: { rateLimit: { max: app.config.downloads.zip.rateLimitMax, timeWindow: app.config.downloads.zip.rateLimitWindow } }` — env vars `ASCIIDOCOLLAB_DOWNLOADS_ZIP_RATE_LIMIT_MAX/WINDOW`; default: 10 req / 60 s
   - File route: `config: { rateLimit: { max: app.config.downloads.file.rateLimitMax, timeWindow: app.config.downloads.file.rateLimitWindow } }` — env vars `ASCIIDOCOLLAB_DOWNLOADS_FILE_RATE_LIMIT_MAX/WINDOW`; default: 30 req / 60 s
   - Both values MUST be defined in `apps/api/src/config/schema.ts` under a new `downloads.*` section; defaults set in `apps/api/config/default.yaml`; `development.yaml` and `test.yaml` must have generous overrides (1000 and 10000 respectively)
9. **Frontend — file context menu**:
   - `apps/web/src/components/file-tree/file-tree-actions.tsx` — `onDownload` triggers via `<a href download>` link
   - `apps/web/src/components/file-tree/file-tree-node.tsx` — show Download for file nodes only
10. **Frontend — root node context menu**:
    - `apps/web/src/components/file-tree/file-tree-node.tsx` or `file-tree.tsx` — root node context menu includes "Download as ZIP"; button enters disabled/loading state on click (FR-029)

**Tests**:
- `packages/domain/tests/use-cases/project/download-file.test.ts` — member downloads own file ✅; non-member 403; file from different project → 404 (IDOR); folder node → 400
- `packages/domain/tests/use-cases/project/download-project.test.ts` — member gets file list; non-member 403
- `apps/api/tests/routes/files/download.test.ts` — route delegates to use case; response streams file content
- `apps/api/tests/routes/projects/download.test.ts` — ZIP response headers correct; archiver receives streams; rate limit returns 429

---

### Phase G: Drag-and-Drop File Tree Reorganisation (P3)

`MoveFileUseCase` already exists and handles moves + cascade path updates.

**Pre-condition**: `MoveFileUseCase` already validates that `newParentId` belongs to the same project (`move-file.ts:38` — `newParent.projectId.value !== projectId.value` guard). T078 adds a verification test covering this path; the test will be **green from the start** (no production code change required).

1. **Conflict detection in frontend** — before calling the move API, check whether the destination folder in the local tree state already contains a node with the same name as the dragged item. If conflict detected, surface it in the confirmation dialog.
2. **`apps/web/src/components/file-tree/file-tree.tsx`** — add drag state via `useRef`/`useState`; wire `onDragStart`, `onDragOver`, `onDrop` on the root container
3. **`apps/web/src/components/file-tree/file-tree-node.tsx`**:
   - Make nodes `draggable` with `onDragStart` (stores source node ID)
   - On `onDragOver` for folder nodes: set visual highlight class; call `event.preventDefault()` to allow drop
   - On `onDrop`: show confirmation dialog
4. **Confirmation dialog** — extend existing `confirmation-dialog.tsx` or create `move-confirmation-dialog.tsx`:
   - Non-conflict: shows "Move `<name>` to `<destination>`?" with Cancel / Confirm
   - Conflict: shows "A file named `<name>` already exists in `<destination>`. Cancel or rename to `<name> (1)`?" with Cancel / Move & Rename
5. **API call** — on confirm, call `POST /projects/:id/files/:fileNodeId/move` (existing endpoint) with `newParentId`. If rename chosen, first call rename (existing `rename` endpoint), then move.

**Tests**:
- `apps/web/tests/components/file-tree/file-tree-dnd.test.tsx` — drag start sets state; drop on valid folder shows dialog; drop on self is no-op; conflict renders rename option; cancel leaves tree unchanged

---

## Complexity Tracking

No P0 violations. All patterns follow existing architecture. No complexity justification required.

**Constitution Exception — T078**: `MoveFileUseCase`'s cross-project guard is pre-existing production code being tested retroactively. The verification test (T078) will be green from the start — an acknowledged exception to the constitution's "A test that never failed is not a valid test" principle. Justification: the guard at `move-file.ts:38` already exists; T078 adds coverage, not new behaviour. All new functionality introduced by this feature follows Red-Green-Refactor.

---

## Delivery Order

| Phase | Priority | Depends on | Estimated size |
|-------|----------|-----------|----------------|
| A — Dark Mode Infrastructure | P1 | — | S |
| B — User Avatar Menu | P1 | A (theme CSS in place) | M |
| C — Admin Audit Log | P2 | B (menu entry point) | M |
| D — Admin System Settings Page | P2 | B (menu entry point) | S |
| E — Editor Soft Wrap | P2 | — | S |
| F — File Downloads | P3 | — | S |
| G — Drag-and-Drop Tree | P3 | — | M |

Phases E, F, G are independent and can be parallelised after A+B land.
