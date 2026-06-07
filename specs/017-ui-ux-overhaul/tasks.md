# Tasks: UI/UX Overhaul — Editor Options, Downloads, Dark Mode & User Menu

**Input**: Design documents from `specs/017-ui-ux-overhaul/`

**Constitution**: TDD is NON-NEGOTIABLE. Every test task marked ⬛ MUST be written first and confirmed failing before the paired implementation task begins.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Maps to user story in spec.md (US1–US8)
- Test tasks are required per the project constitution (Red-Green-Refactor)

## Path Conventions

| Package / App             | Source root                    | Test root                        |
|---------------------------|--------------------------------|----------------------------------|
| `packages/domain`         | `packages/domain/src/`         | `packages/domain/tests/`         |
| `packages/infrastructure` | `packages/infrastructure/src/` | `packages/infrastructure/tests/` |
| `apps/api`                | `apps/api/src/`                | `apps/api/tests/`                |
| `apps/web`                | `apps/web/src/`                | `apps/web/tests/`                |

---

## Phase 1: Setup

**Purpose**: Install new dependencies required across all user stories.

- [X] T001 Add `@dicebear/core` and `@dicebear/collection` to `apps/web/package.json` and run `pnpm install`
- [X] T002 Add `archiver` and `@types/archiver` to `apps/api/package.json` and run `pnpm install`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema changes, shared types, port extensions, and infrastructure implementations that ALL user stories depend on. No user story work may begin until this phase is complete.

**⚠️ CRITICAL — Prisma migrations require explicit user confirmation before running.**

### Schema

- [X] T003 [P] Add `avatarKey String?` and `appTheme String @default("system")` to `User` model in `packages/db/prisma/schema.prisma`
- [X] T004 [P] Add `softWrap Boolean @default(true)` to `EditorPreferences` model in `packages/db/prisma/schema.prisma`
- [X] T005 Ask user to confirm, then generate and apply Prisma migration for T003 + T004 changes (single migration covering all new columns); also add `@@index([createdAt(sort: Desc), userId, actionType])` compound index to the `AuditLog` model in `packages/db/prisma/schema.prisma` and include it in this same migration — required for SC-004 (sub-3-second Audit Log page loads on large tables)

### Domain Layer

- [X] T006 [P] ⬛ First update `packages/domain/tests/entities/user.test.ts` to assert `avatarKey` and `appTheme` are accessible on the entity and confirm failing; then add `avatarKey: string | null` and `appTheme: string` to `User` entity constructor and fields in `packages/domain/src/entities/user.ts`
- [X] T007 [P] Add `findWithFilters(filters, pagination): Promise<PagedResult<AuditLog>>` and `findDistinctActionTypes(): Promise<string[]>` method signatures to `AuditLogRepository` interface in `packages/domain/src/ports/admin/audit-log.repository.ts`
- [X] T008 [P] Add `readStream(projectId: ProjectId, filePath: FilePath): Promise<Readable | null>` method signature to `ProjectFileStore` interface in `packages/domain/src/ports/storage/project-file-store.ts`

### Shared DTOs

- [X] T009 [P] Add `avatarKey: string | null` and `appTheme: string` fields to `UserProfileDto` in `packages/shared/src/dtos/user-profile.dto.ts`
- [X] T010 [P] Create `AuditLogDto` and `AuditLogPageDto` types in `packages/shared/src/dtos/audit-log.dto.ts`

### Infrastructure

- [X] T011 [P] Update `UserRepository` Prisma mapper to read and write `avatarKey` and `appTheme` columns in `packages/infrastructure/src/persistence/user/prisma-user.repository.ts`
- [X] T012 [P] Implement `readStream()` in the filesystem `ProjectFileStore` implementation using `fs.createReadStream()` in `packages/infrastructure/src/persistence/storage/` (locate the concrete class file)
- [X] T013 [P] Implement `findWithFilters()` (Prisma `where` + `skip`/`take`) and `findDistinctActionTypes()` (`groupBy action`) in the Prisma `AuditLogRepository` in `packages/infrastructure/src/persistence/admin/prisma-audit-log.repository.ts`

### Test Doubles

- [X] T014 [P] ⬛ Update `AuditLogRepository` in-memory fake to implement `findWithFilters()` and `findDistinctActionTypes()` in `packages/domain/tests/ports/admin/in-memory-audit-log.repository.ts`
- [X] T015 [P] ⬛ Update `ProjectFileStore` in-memory fake to implement `readStream()` using `Readable.from(storedBuffer)` in `packages/domain/tests/ports/storage/in-memory-project-file-store.ts`

### Rate Limit Config (prerequisite for T072 and T077)

- [X] T079 [P] Add convict schema entries for new rate limits in `apps/api/src/config/schema.ts` under a new `downloads` section and the existing `admin` section:
  - `downloads.zip.rateLimitMax` / `rateLimitWindow` — env `ASCIIDOCOLLAB_DOWNLOADS_ZIP_RATE_LIMIT_MAX/WINDOW`
  - `downloads.file.rateLimitMax` / `rateLimitWindow` — env `ASCIIDOCOLLAB_DOWNLOADS_FILE_RATE_LIMIT_MAX/WINDOW`
  - `admin.auditLog.rateLimitMax` / `rateLimitWindow` — env `ASCIIDOCOLLAB_ADMIN_AUDIT_LOG_RATE_LIMIT_MAX/WINDOW`
  - Follow the exact convict field structure (doc, format: 'integer', default, env) used by neighbouring entries
- [X] T080 [P] Update YAML config files with rate limit defaults (must complete alongside T079):
  - `apps/api/config/default.yaml`: add `downloads: { zip: { rateLimitMax: 10, rateLimitWindow: 60000 }, file: { rateLimitMax: 30, rateLimitWindow: 60000 } }` and `admin.auditLog: { rateLimitMax: 120, rateLimitWindow: 60000 }`
  - `apps/api/config/development.yaml`: add same sections with generous values (rateLimitMax: 1000, rateLimitWindow: 60000) — matches existing dev pattern
  - `apps/api/config/test.yaml`: add same sections with high values (rateLimitMax: 10000, rateLimitWindow: 60000) — matches existing test pattern
  - `apps/api/config/production.yaml`: no changes required (production uses defaults from schema/default.yaml)

### Update Profile Use Case (prerequisite for T020 and T026)

- [X] T084 [P] ⬛ Write failing unit test for `UpdateProfileUseCase` — validates `appTheme` rejects values outside `["light", "dark", "system"]`; persists `displayName`, `avatarKey`, and `appTheme` independently (each field optional, only non-null fields written); uses in-memory `UserRepository` fake in `packages/domain/tests/use-cases/auth/update-profile.test.ts` — **must confirm failing before T083**
- [X] T083 Create `UpdateProfileUseCase` accepting `{ userId, displayName?, avatarKey?, appTheme? }`: validates `appTheme` against `["light", "dark", "system"]` if provided; persists all non-null provided fields via `UserRepository`; new callers MUST use this instead of `UpdateDisplayNameUseCase` in `packages/domain/src/use-cases/auth/update-profile.ts` — **must not start until T084 is confirmed failing**

### Admin Page Guard (prerequisite for T069 and T070)

- [X] T081 [P] Create `requireAdminOrRedirect(resourcePath: string): Promise<void>` helper in `apps/web/src/lib/admin-guard.ts`: reads session from cookies; if `!session.user.isAdmin`, fires `POST /admin/access-denied` with `{ resource: resourcePath }` (server-side fetch with session cookie forwarded) then calls `redirect('/dashboard')`; if admin, returns without action. Write failing test first in `apps/web/tests/lib/admin-guard.test.ts` (non-admin fires POST + redirects; admin passes through)
- [X] T082 [P] Add `POST /admin/access-denied` route with `requireAuth` preHandler in `apps/api/src/routes/admin/access-denied.ts`: accepts `{ resource: string }` body; saves `AuditLog { action: 'UNAUTHORIZED_PAGE_ACCESS', resourceType: 'PAGE', resourceId: resource, userId: session.userId }` via `AuditLogRepository.save()`; returns `204 No Content`; register in `apps/api/src/index.ts`. Write failing test first in `apps/api/tests/routes/admin/access-denied.test.ts` (unauthenticated → 401; authenticated → 204 + AuditLog saved)

**Checkpoint**: Foundation complete — schema migrated, all ports extended, all infrastructure implementations and fakes updated, rate limit config entries registered. User story phases may now begin.

---

## Phase 3: US1 — Dark Mode & Theme Preference (Priority: P1) 🎯 MVP

**Goal**: Application automatically applies the user's saved theme (DB-canonical) and switches immediately when changed via the user menu; unauthenticated pages fall back to OS preference.

**Independent Test**: Set OS to dark mode → visit app logged in with no theme preference saved → verify dark theme applied. Change theme via Application Theme control → verify entire app switches and preference persists after logout/login from a different browser.

### Tests ⬛ Write and confirm failing BEFORE implementation

- [X] T016 [P] [US1] ⬛ Write failing test for `useTheme` hook — DB value loaded on mount, `setTheme` calls API and writes cookie, OS fallback when unauthenticated in `apps/web/tests/hooks/use-theme.test.ts`
- [X] T017 [P] [US1] ⬛ Write failing test for `ThemeProvider` — renders children, reads profile on mount, corrects cookie-seeded class if DB differs in `apps/web/tests/components/theme-provider.test.tsx`

### Implementation

- [X] T018 [US1] Add `darkMode: 'class'` to `apps/web/tailwind.config.ts`
- [X] T019 [US1] ⬛ Write failing test for updated profile-update route — accepts valid `appTheme` values (`"light"`, `"dark"`, `"system"`), rejects invalid values in `apps/api/tests/routes/profile-update.test.ts`
- [X] T020 [US1] Update `apps/api/src/routes/profile-update.ts`: **URL fix** — re-register at `/auth/me/profile` (was `/auth/profile`); accept `displayName`, `appTheme` (`"light" | "dark" | "system"`), and `avatarKey` in body; call `UpdateProfileUseCase` (T083); Fastify schema validates `appTheme` enum — **must not start until T019 is confirmed failing**
- [X] T021 [US1] Create `useTheme` hook: loads `appTheme` from profile API, calls `PATCH /auth/me/profile` on change, writes `asciidocollab-theme` cookie, toggles `document.documentElement.classList`, falls back to `matchMedia` when unauthenticated in `apps/web/src/hooks/use-theme.ts`
- [X] T022 [US1] Create `ThemeProvider` client component: reads profile on mount to confirm/correct DB value, exposes theme context to children in `apps/web/src/components/theme-provider.tsx`
- [X] T023 [US1] Update root layout to read `asciidocollab-theme` cookie server-side via `cookies()` and apply `class="dark"` or `class=""` to `<html>` before hydration; wrap body with `ThemeProvider` in `apps/web/src/app/layout.tsx`

**Checkpoint**: Dark mode fully functional — theme persists in DB, cookie prevents FOUT, OS detection works for unauthenticated pages.

---

## Phase 4: US2 + US3 — User Avatar Menu & Configurable Avatar (Priority: P1)

**Goal**: Replace Account/Sign-Out/username controls with a single user button showing username and DiceBear avatar. Dropdown contains all navigation sections. Leftmost panel removed. Users can pick their avatar style in the Display Name settings form.

**Independent Test**: Log in → verify sidebar is gone and user button shows username + avatar → open dropdown → verify all sections present (Account, Settings, GitHub, Log Out) → log in as admin → verify admin sections also appear → change avatar style → verify header button updates.

### Tests ⬛

- [X] T024 [P] [US2] ⬛ Write failing test for `UserMenu` — renders admin items only for admin users (both Administrator Settings and Audit Log sections absent for non-admin), GitHub link has `target="_blank"`, Log Out triggers signout in `apps/web/tests/components/user-menu.test.tsx`
- [X] T025 [P] [US2] ⬛ Write failing test for `Avatar` component — renders SVG for known style key, falls back to `DEFAULT_AVATAR_STYLE` for null/unknown, different display names produce different output in `apps/web/tests/components/avatar.test.tsx`
- [X] T085 [P] [US2] ⬛ Write failing test for Administrator System Settings page — form renders values fetched from `GET /admin/settings`, submit sends correct PATCH body to `/admin/settings`, non-admin session triggers redirect to `/dashboard` in `apps/web/tests/app/admin/settings.test.tsx` — **must confirm failing before T032 and T069**

### Implementation

- [X] T026 [US2] **Depends on T020** — verify `avatarKey: string | null` (max-length 50, no style enumeration server-side) is included in the route body schema by T020; this task is a no-op if T020 is complete. Do NOT proceed with this task in parallel with Phase 3; T020 must be merged first in `apps/api/src/routes/profile-update.ts`
- [X] T027 [US2] Create DiceBear style registry exporting `DICEBEAR_STYLES`, `AvatarStyleKey`, and `DEFAULT_AVATAR_STYLE = 'initial-face'` in `apps/web/src/lib/avatars.ts`
- [X] T028 [US2] Create `Avatar` component: generates SVG via `createAvatar(DICEBEAR_STYLES[key ?? DEFAULT_AVATAR_STYLE].style, { seed: displayName })`, renders inline; unknown/null key falls back silently in `apps/web/src/components/avatar.tsx`
- [X] T029 [US2] Create `UserMenu` component: user button (username + `<Avatar>`) with Radix `DropdownMenu`; sections in FR-006 order: Account (Display Name, Password, Email), Settings (Keyboard Shortcuts, Application Theme), Administrator Settings (admin only — contains: Users, System Settings), Audit Log (admin only — separate section from Administrator Settings), GitHub link (opens in new tab), Log Out in `apps/web/src/components/user-menu.tsx`
- [X] T030 [US2] ⬛ Write failing test for `(dashboard)/layout.tsx` in `apps/web/tests/app/(dashboard)/layout.test.tsx` — sidebar `<div>` not rendered, `<UserMenu>` present in header, `<ThemeProvider>` wraps children; then update `(dashboard)/layout.tsx`: remove sidebar `<div>` and all nav links, replace Account/Sign-Out/username header controls with `<UserMenu>`, wrap with `ThemeProvider` in `apps/web/src/app/(dashboard)/layout.tsx`
- [X] T031 [US3] ⬛ Write failing test for avatar picker in `apps/web/tests/app/(dashboard)/dashboard/account/display-name-card.test.tsx` — all DiceBear styles render as selectable options, active style is highlighted, submit PATCH includes `avatarKey`; then add avatar style picker to Display Name settings form: iterate `Object.entries(DICEBEAR_STYLES)`, render a preview `<Avatar>` per style using user's current display name as seed, highlight active selection; on form submit PATCH `avatarKey` alongside `displayName` in `apps/web/src/app/(dashboard)/dashboard/account/display-name-card.tsx`
- [X] T032 [US2] Add Administrator System Settings page (frontend only — API already exists at `GET/PATCH /admin/settings`): form cards for Open Registration toggle and Max Upload Size; fetch on load, PATCH on save in `apps/web/src/app/(dashboard)/dashboard/admin/settings/page.tsx`
- [X] T069 [US2] Add server-side admin guard to settings page: call `requireAdminOrRedirect('/dashboard/admin/settings')` (T081) at the top of the server component — logs denial to `AuditLog` then redirects if not admin (FR-034) in `apps/web/src/app/(dashboard)/dashboard/admin/settings/page.tsx`

**Checkpoint**: User menu functional, sidebar removed, avatar picker works, admin settings page accessible from dropdown and protected server-side.

---

## Phase 5: US4 — Administrator Audit Log (Priority: P2)

**Goal**: Admin-only Audit Log page with paginated entries and search filters (date range, actor, action type via dynamic dropdown from DB).

**Independent Test**: Log in as admin → click Audit Log in dropdown → page loads with entries showing timestamp, actor, action, resource → apply date filter → results narrow → apply action type filter from dropdown → results narrow further → non-admin direct URL access returns redirect.

### Tests ⬛

- [X] T033 [P] [US4] ⬛ Write failing unit test for `ListAuditLogsUseCase` — admin gate enforced, filters applied, pagination correct (default limit 50, max 200), non-admin returns error in `packages/domain/tests/use-cases/admin/list-audit-logs.test.ts`
- [X] T034 [P] [US4] ⬛ Write failing integration test for `GET /admin/audit-logs` — correct response shape, filter params wired, default limit 50 applied when omitted, non-admin 403 in `apps/api/tests/routes/admin/audit-logs.test.ts`
- [X] T086 [P] [US4] ⬛ Write failing test for Audit Log page — entries render with correct columns (timestamp, actor, action type, resource type, resource ID), applying a filter updates query params, empty state shown when no results, non-admin session triggers redirect to `/dashboard` in `apps/web/tests/app/admin/audit-log.test.tsx` — **must confirm failing before T039, T040, and T070**

### Implementation

- [X] T035 [US4] Create `ListAuditLogsUseCase` — validates actor is admin, calls `findWithFilters()` with filters and pagination (default `limit: 50`, max `200` — enforced in use case to satisfy SC-004), returns `PagedResult<AuditLog>`; returns `PermissionDeniedError` for non-admin in `packages/domain/src/use-cases/admin/list-audit-logs.ts`
- [X] T036 [US4] Register `GET /admin/audit-logs` route with `requireAuth` + `requireAdmin` preHandlers; wire query params (`fromDate`, `toDate`, `userId`, `actionType`, `page`, `limit`) to `ListAuditLogsUseCase` — default `limit: 50`, max `200` enforced by use case (SC-004); map result to `AuditLogPageDto` in `apps/api/src/routes/admin/audit-logs.ts`
- [X] T037 [P] [US4] Register `GET /admin/audit-logs/action-types` route; call `findDistinctActionTypes()` and return `{ actionTypes: string[] }` in `apps/api/src/routes/admin/audit-logs.ts`
- [X] T038 [US4] Register the two new audit-log routes in the Fastify app index/plugin registry in `apps/api/src/index.ts` or equivalent route registration file
- [X] T039 [US4] Create Audit Log page: table with columns (timestamp, actor, action type, resource type, resource ID); filter bar (date range picker, actor dropdown, action type dropdown populated from `GET /admin/audit-logs/action-types`); pagination controls in `apps/web/src/app/(dashboard)/dashboard/admin/audit-log/page.tsx`
- [X] T040 [US4] Add empty state to Audit Log page — message shown when active filters return zero results in `apps/web/src/app/(dashboard)/dashboard/admin/audit-log/page.tsx`
- [X] T070 [US4] Add server-side admin guard to audit-log page: call `requireAdminOrRedirect('/dashboard/admin/audit-log')` (T081) at the top of the server component — logs denial to `AuditLog` then redirects if not admin (FR-019) in `apps/web/src/app/(dashboard)/dashboard/admin/audit-log/page.tsx`
- [X] T071 [P] [US4] Write infrastructure integration test for `AuditLogRepository` using testcontainers (real PostgreSQL): verifies `findWithFilters()` applies date/user/action filters correctly and `findDistinctActionTypes()` returns only values present in DB in `packages/infrastructure/tests/persistence/admin/audit-log.repository.test.ts`
- [X] T072 [P] [US4] Add per-IP rate limiting to audit-log routes (FR-045) — **depends on T079/T080**: add `config: { rateLimit: { max: app.config.admin.auditLog.rateLimitMax, timeWindow: app.config.admin.auditLog.rateLimitWindow } }` to both `GET /admin/audit-logs` and `GET /admin/audit-logs/action-types` route definitions in `apps/api/src/routes/admin/audit-logs.ts`; add test asserting HTTP 429 when limit is exceeded (env: `ASCIIDOCOLLAB_ADMIN_AUDIT_LOG_RATE_LIMIT_MAX/WINDOW`)

**Checkpoint**: Audit Log page functional for admins; all filters work independently and combined; non-admin access blocked at server component level; rate limiting enforced; infrastructure integration tests passing.

---

## Phase 6: US5 — Editor Soft Wrap Toggle (Priority: P2)

**Goal**: Soft-wrap toggle in editor toolbar next to font size and theme controls; default on; preference persisted to DB via EditorPreferences (same pattern as fontSize, editor theme, scrollSync).

**Independent Test**: Open editor → soft-wrap toggle visible and in ON state → long-line file wraps within panel → toggle off → horizontal scrollbar appears → refresh page → OFF state restored from DB.

### Tests ⬛

- [X] T041 [P] [US5] ⬛ Write failing unit test for `SaveEditorPreferencesUseCase` — softWrap field accepted and persisted in `packages/domain/tests/use-cases/settings/save-editor-preferences.test.ts`
- [X] T042 [P] [US5] ⬛ Write failing test for `useEditorPreferences` hook — softWrap included in initial fetch and PUT payload, localStorage cache updated in `apps/web/tests/hooks/use-editor-preferences.test.ts`
- [X] T043 [P] [US5] ⬛ Write failing test for `EditorSettingsPanel` — soft-wrap toggle renders next to theme selector, fires `setSoftWrap` callback on change in `apps/web/tests/components/editor/editor-settings-panel.test.tsx`

### Implementation

- [X] T044 [US5] ⬛ First update `packages/domain/tests/use-cases/settings/get-editor-preferences.test.ts` to assert `softWrap` is returned and confirm failing; then update `GetEditorPreferencesUseCase` to read and return `softWrap` field in `packages/domain/src/use-cases/settings/get-editor-preferences.ts`
- [X] T045 [US5] Update `SaveEditorPreferencesUseCase` to accept and persist `softWrap: boolean` in `packages/domain/src/use-cases/settings/save-editor-preferences.ts`
- [X] T046 [US5] Add `softWrap` to `GET /auth/me/editor-preferences` response schema and `PUT /auth/me/editor-preferences` body schema in `apps/api/src/routes/editor-preferences.ts`
- [X] T047 [US5] Add `softWrap: boolean` (default `true`) to `EditorPrefs` type, localStorage key, state, and `setSoftWrap` setter; include in PUT payload in `apps/web/src/hooks/use-editor-preferences.ts`
- [X] T048 [US5] Add soft-wrap toggle (shadcn Switch or checkbox) labelled "Soft Wrap" to `EditorSettingsPanel`, positioned after Theme selector; wired to `setSoftWrap` prop in `apps/web/src/components/editor/editor-settings-panel.tsx`
- [X] T049 [US5] ⬛ Write failing test for `AsciidocEditor` soft-wrap integration in `apps/web/tests/components/editor/asciidoc-editor.test.tsx` — `EditorView.lineWrapping` is present in the extension array when `softWrap=true`, absent when `softWrap=false`; then conditionally add/remove `EditorView.lineWrapping` from the CodeMirror extension array based on `softWrap` preference in `apps/web/src/components/editor/asciidoc-editor.tsx`

**Checkpoint**: Soft-wrap toggle functional, persists to DB, CodeMirror responds immediately on toggle.

---

## Phase 7: US6 + US7 — File Downloads (Priority: P3)

**Goal**: "Download as ZIP" on the root project tree node (true streaming — no disk, no memory buffer); "Download" on individual file context menus.

**Independent Test (US6)**: Right-click root project node → "Download as ZIP" → file named `<project-name>-YYYY-MM-DD.zip` downloads → open zip → directory structure matches tree exactly. **Independent Test (US7)**: Right-click any file → "Download" → correct file content downloads with original filename.

### Tests ⬛ Write and confirm failing BEFORE implementation

- [X] T073 [P] [US7] ⬛ Write failing unit test for `DownloadFileUseCase`: member downloads own file ✅; non-member returns `PermissionDeniedError`; `fileNodeId` from a different project returns `NotFoundError` (IDOR guard — FR-042); folder node returns `ValidationError` in `packages/domain/tests/use-cases/project/download-file.test.ts`
- [X] T074 [P] [US6] ⬛ Write failing unit test for `DownloadProjectUseCase`: member receives file list with relative paths; non-member returns `PermissionDeniedError` in `packages/domain/tests/use-cases/project/download-project.test.ts`
- [X] T050 [P] [US6] ⬛ Write failing API test for `GET /projects/:projectId/download` — ZIP headers correct, archiver receives streams not buffers, non-member returns 403, rate limit returns 429 in `apps/api/tests/routes/projects/download.test.ts`
- [X] T051 [P] [US7] ⬛ Write failing API test for `GET /projects/:projectId/files/:fileNodeId/download` — member can download file, folder returns 400, non-member 403, file from different project returns 404 (IDOR), `fileStore.readStream()` returns null → 404, rate limit returns 429 in `apps/api/tests/routes/files/download.test.ts`

### Implementation

- [X] T075 [US7] Create `DownloadFileUseCase`: verify membership; query `fileNode WHERE id = fileNodeId AND projectId = projectId` (returns `NotFoundError` if not found in this project — IDOR guard FR-042); verify `FILE` type; return `Result<{ fileNode, filePath }, PermissionDeniedError | NotFoundError | ValidationError>` in `packages/domain/src/use-cases/project/download-file.ts`
- [X] T076 [US6] Create `DownloadProjectUseCase`: verify membership; return project name + all `FILE` nodes with relative paths; return `Result<{ projectName, files }, PermissionDeniedError | NotFoundError>` in `packages/domain/src/use-cases/project/download-project.ts`
- [X] T052 [US6] Create streaming ZIP endpoint `GET /projects/:projectId/download`: call `DownloadProjectUseCase`; map errors to HTTP (403/404); set `Content-Type: application/zip` and `Content-Disposition: attachment; filename="<project-name>-<YYYY-MM-DD>.zip"` (date from server UTC — FR-026); create `archiver.create('zip')` piped to `reply.raw`; for each file call `fileStore.readStream()` — if it returns `null` skip the file with a logged warning (filesystem/DB desync guard); otherwise `archive.append(stream, { name: relativePath })`; call `archive.finalize()` in `apps/api/src/routes/projects/download.ts`
- [X] T053 [US7] Create individual file download endpoint `GET /projects/:projectId/files/:fileNodeId/download`: call `DownloadFileUseCase`; map errors to HTTP (403/404/400); call `fileStore.readStream()` — if it returns `null`, reply with `404` (filesystem/DB desync guard; add this case to T051 test); pipe stream to `reply.raw` with `Content-Disposition: attachment; filename="<name>"` in `apps/api/src/routes/files/download.ts`
- [X] T054 [US6] Register new download routes in Fastify plugin/index registry in `apps/api/src/index.ts` or equivalent
- [X] T077 [P] [US6][US7] Apply per-IP rate limiting to both download routes (FR-044) — **depends on T079/T080**: add `config: { rateLimit: { max: app.config.downloads.zip.rateLimitMax, timeWindow: app.config.downloads.zip.rateLimitWindow } }` to the ZIP route in `apps/api/src/routes/projects/download.ts`, and `config: { rateLimit: { max: app.config.downloads.file.rateLimitMax, timeWindow: app.config.downloads.file.rateLimitWindow } }` to the file route in `apps/api/src/routes/files/download.ts` (env: `ASCIIDOCOLLAB_DOWNLOADS_ZIP_RATE_LIMIT_MAX/WINDOW` and `ASCIIDOCOLLAB_DOWNLOADS_FILE_RATE_LIMIT_MAX/WINDOW`)
- [X] T055 [P] [US7] ⬛ Write failing test for file context menu download action in `apps/web/tests/components/file-tree/file-tree-actions.test.tsx` — "Download" option renders for FILE nodes, absent for FOLDER nodes, `<a>` element has correct `href` and `download` attribute; then add `onDownload` action to file context menu in `apps/web/src/components/file-tree/file-tree-actions.tsx`
- [X] T056 [US6] ⬛ Write failing test for "Download as ZIP" context menu item in `apps/web/tests/components/file-tree/file-tree-node.test.tsx` — item is disabled immediately on click (loading state per FR-029) and re-enables after 1 s (debounce to prevent double-click only; browser-native download dialog provides actual progress feedback per FR-029); then add "Download as ZIP" option to the root project node context menu, triggering via `<a href download>`, in `apps/web/src/components/file-tree/file-tree-node.tsx` (or `file-tree.tsx`)

**Checkpoint**: ZIP downloads stream with no disk or memory buffering; individual file downloads work from context menu; both enforce RBAC in domain use cases (not routes); IDOR cross-project protection tested; rate limiting enforced; loading state shown on click.

---

## Phase 8: US8 — Drag-and-Drop File Tree Reorganisation (Priority: P3)

**Goal**: Drag files and folders within the tree to a new parent folder; confirmation dialog shows move details; name conflict offers cancel or auto-rename; `MoveFileUseCase` (existing) handles the actual move.

**Independent Test**: Drag a file to a different folder → confirmation dialog appears with source and destination paths → confirm → file moves and tree updates. Drag to a folder with same-named item → dialog shows conflict with rename option → choose rename → file moves with ` (1)` suffix.

### Pre-condition ⬛

- [X] T078 [US8] Verify `MoveFileUseCase` already rejects cross-project `newParentId` (FR-043): add a test case to the existing `packages/domain/tests/use-cases/file-tree/move-file.test.ts` asserting that a move where `newParentId` belongs to a different project returns `FileNodeNotFoundError` — the check at `move-file.ts:38` already handles this, so the test will be **green from the start** (this is verification coverage, not Red-Green-Refactor)

### Tests ⬛

- [X] T057 [P] [US8] ⬛ Write failing test for file-tree DnD — drag start sets drag state, drop on valid folder shows confirmation dialog, drop on self or same parent is no-op, cancel leaves tree unchanged in `apps/web/tests/components/file-tree/file-tree-dnd.test.tsx`
- [X] T058 [P] [US8] ⬛ Write failing test for move confirmation dialog — non-conflict shows source/destination, conflict shows rename option, cancel fires with no action in `apps/web/tests/components/file-tree/move-confirmation-dialog.test.tsx`

### Implementation

- [X] T059 [US8] Add drag state (`draggedNodeId: string | null`, `dragOverNodeId: string | null`) to file tree via `useState`/`useRef`; attach `onDragStart` to root container in `apps/web/src/components/file-tree/file-tree.tsx`
- [X] T060 [US8] Make each `FileTreeNode` draggable: add `draggable={true}` and `onDragStart` (stores node ID); add `onDragOver` for folder nodes (sets highlight class, calls `event.preventDefault()`); add `onDrop` handler in `apps/web/src/components/file-tree/file-tree-node.tsx`
- [X] T061 [US8] Create `MoveConfirmationDialog` component: non-conflict variant (source path, destination path, Cancel + Confirm); conflict variant (shows same-name warning, Cancel + "Move & Rename" option which appends ` (1)` suffix); extend or reuse existing `confirmation-dialog.tsx` in `apps/web/src/components/file-tree/move-confirmation-dialog.tsx`
- [X] T062 [US8] Implement conflict detection in the `onDrop` handler: check whether destination folder in local tree state already contains a node with the same name as the dragged item; pass conflict flag to `MoveConfirmationDialog` in `apps/web/src/components/file-tree/file-tree.tsx`
- [X] T063 [US8] On confirmation (no conflict): call `POST /projects/:id/files/:fileNodeId/move` with `{ newParentId }` (existing API); refresh tree on success in `apps/web/src/components/file-tree/file-tree.tsx`
- [X] T064 [US8] On "Move & Rename" (conflict path): first call rename API to append numeric suffix, then call move API; refresh tree on success in `apps/web/src/components/file-tree/file-tree.tsx`
- [X] T065 [US8] Add CSS visual highlight class for valid drop-target folders during drag (`border-dashed` or similar Tailwind utility) in `apps/web/src/components/file-tree/file-tree-node.tsx`

**Checkpoint**: Full drag-and-drop flow functional including conflict resolution; `MoveFileUseCase` (existing) handles all server-side logic.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T066 [P] Run `pnpm lint` across all modified packages and fix any warnings in `apps/web`, `apps/api`, `packages/domain`, `packages/infrastructure`, `packages/shared`
- [X] T067 [P] Run `pnpm typecheck` across all modified packages and resolve all type errors
- [X] T068 Verify AGENTS.md `<!-- SPECKIT START -->` block references `specs/017-ui-ux-overhaul/plan.md` in `AGENTS.md`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)          → no dependencies, start immediately
Phase 2 (Foundational)   → depends on Phase 1 — BLOCKS all user stories
Phase 3 (US1 Dark Mode)  → depends on Phase 2 only
Phase 4 (US2+US3 Menu)   → depends on Phase 2 only; Phase 3 should land first (ThemeProvider needed in layout)
Phase 5 (US4 Audit Log)  → depends on Phase 2 only; menu entry (Phase 4) needed for navigation
Phase 6 (US5 Soft Wrap)  → depends on Phase 2 only — fully independent of Phases 3–5
Phase 7 (US6+US7 Download) → depends on Phase 2 only — fully independent
Phase 8 (US8 Drag-Drop)  → depends on Phase 2 only — fully independent
Phase 9 (Polish)         → depends on all prior phases
```

### User Story Dependencies

| Story | Depends on | Can start after |
|-------|-----------|-----------------|
| US1 Dark Mode | Phase 2 | Foundational complete |
| US2 User Menu | Phase 2, US1 (ThemeProvider) | Phase 3 complete |
| US3 Avatar | Phase 2, US2 | Phase 4 partial (UserMenu exists) |
| US4 Audit Log | Phase 2, US2 (dropdown entry) | Phase 4 complete |
| US5 Soft Wrap | Phase 2 | Foundational complete |
| US6 ZIP Download | Phase 2 | Foundational complete |
| US7 File Download | Phase 2 | Foundational complete |
| US8 Drag-Drop | Phase 2 | Foundational complete |

### Parallel Opportunities Within Phases

**Phase 2**: T003–T015, T079–T084 are all parallel after T002 installs dependencies (T005 migration must complete before T006–T015; T079–T084 are independent of migration and can run alongside). T084 (UpdateProfileUseCase test) MUST complete and be confirmed failing before T083 starts.

**Phase 3 (US1)**: T016–T017 (test writing) run in parallel; T021–T023 run after T018–T020.

**Phase 4 (US2+US3)**: T024–T025+T085 (tests) parallel; T027–T028 (avatars.ts + Avatar component) parallel before T029 (UserMenu needs both); T085 must be confirmed failing before T032/T069.

**Phase 5 (US4)**: T033–T034+T086 (tests) parallel; T086 must be confirmed failing before T039/T040/T070; T036–T037 (route handlers) parallel after T035.

**Phase 7 (US6+US7)**: T073–T074+T050–T051 (all test writing) parallel; T075–T076 (domain use cases) parallel; T052–T053+T077 (endpoints + rate limiting) parallel after use cases; T055–T056 (frontend) parallel.

**Phase 8 (US8)**: T057–T058 (tests) parallel; T059–T060 parallel (different files); T061 independent.

---

## Parallel Execution Examples

### Phase 2 — All Foundational Tasks Together

```
Batch A (parallel, no deps):
  T003 — schema: User columns
  T004 — schema: EditorPreferences softWrap

  T084 — UpdateProfileUseCase test (write failing, confirm before T083)

After T005 (migration confirmed + run):
Batch B (all parallel):
  T006 — User entity
  T007 — AuditLogRepository port
  T008 — ProjectFileStore port
  T009 — UserProfileDto
  T010 — AuditLogDto
  T011 — UserRepository mapper
  T012 — FsProjectFileStore readStream
  T013 — AuditLogRepository infrastructure
  T083 — UpdateProfileUseCase (only after T084 confirmed failing)
  T081 — requireAdminOrRedirect helper (Next.js)
  T082 — POST /admin/access-denied route
  T014 — AuditLogRepository fake
  T015 — ProjectFileStore fake
```

### Phase 7 — ZIP and File Download in Parallel

```
Batch A (all parallel — write failing tests first):
  T073 — DownloadFileUseCase unit test (failing)
  T074 — DownloadProjectUseCase unit test (failing)
  T050 — ZIP API route test (failing)
  T051 — file download API route test (failing)

Batch B (after tests written):
  T075 — DownloadFileUseCase (domain)
  T076 — DownloadProjectUseCase (domain)

Batch C (after use cases exist):
  T052 — ZIP streaming endpoint (calls DownloadProjectUseCase)
  T053 — individual file endpoint (calls DownloadFileUseCase)
  T077 — rate limiting for both routes

Batch D:
  T055 — file Download context menu item
  T056 — ZIP root context menu item (with loading state)
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: US1 Dark Mode
4. Complete Phase 4: US2+US3 Avatar Menu (includes Admin Settings page)
5. **STOP and VALIDATE**: Theme switches correctly, sidebar gone, user menu works for both regular and admin users, avatar picker functions
6. All later phases add independent value without risk to Phase 3–4 work

### Incremental Delivery

```
MVP:      Phase 1 → 2 → 3 → 4  (Dark mode + user menu)
Layer 2:  Phase 5              (Audit log)
Layer 3:  Phase 6              (Soft wrap)
Layer 4:  Phase 7              (Downloads)
Layer 5:  Phase 8              (Drag-drop)
```

Phases 6–8 are mutually independent and can be delivered in any order or in parallel by separate developers after Phase 2 (Foundational) is complete.

---

## Notes

- ⬛ = Write test first, confirm it FAILS, then implement — required by project constitution
- [P] = safe to run in parallel (separate files, no shared dependency)
- All test files in `tests/` directory mirroring source tree — never `__tests__/`
- `MoveFileUseCase` already exists and validates cross-project moves at `move-file.ts:38`; T078 adds a verification test that will be **green from the start** — no production code change needed
- Admin settings API already exists at `GET/PATCH /admin/settings` — Phase 4 T032 is frontend only
- Prisma migration covers T003 + T004 together in one script (T005) — do not run separately
- `avatarKey` server-side validation: max-length ≤ 50 chars only; style enumeration is frontend-only; unknown keys fall back to `DEFAULT_AVATAR_STYLE` at render time
- ZIP streaming: archiver receives `Readable` streams, not buffers — no file content in memory
- **RBAC in domain, not routes**: download endpoints use `DownloadFileUseCase` / `DownloadProjectUseCase` for membership checks (T075, T076); route handlers must not contain access-control logic
- **Rate limiting pattern**: T079 adds convict schema entries; T080 adds YAML defaults; T077 (downloads) and T072 (audit-log) wire routes via `config: { rateLimit: { max: app.config.X.rateLimitMax, timeWindow: app.config.X.rateLimitWindow } }` — identical to all existing rate-limited routes. `@fastify/rate-limit` already installed; plugin registered with `global: false` (routes must opt in). Env vars: `ASCIIDOCOLLAB_DOWNLOADS_ZIP_RATE_LIMIT_MAX/WINDOW`, `ASCIIDOCOLLAB_DOWNLOADS_FILE_RATE_LIMIT_MAX/WINDOW`, `ASCIIDOCOLLAB_ADMIN_AUDIT_LOG_RATE_LIMIT_MAX/WINDOW`. T072 and T077 depend on T079+T080.
- **Server-side admin guards**: T069 (settings page) and T070 (audit-log page) add `redirect('/dashboard')` for non-admin sessions (FR-019, FR-034)
- **T020 ordering**: T019 (test) MUST be failing before T020 (implementation) begins
