# Research: Project Management Frontend

**Feature**: `009-project-mgmt-frontend` | **Date**: 2026-05-31

## 1. Owner Role Model

**Decision**: Add `OWNER` as a first-class value to the Prisma `Role` enum and the domain `Role` value object. Authority is established through `ProjectMember.role === 'owner'`, supporting multiple owners per project. The `project.ownerId` column is retained as an audit reference (original creator) but authorization logic in use cases switches to role-based checks.

**Rationale**: The spec (clarification Q1 and Q4) requires: (a) at least one owner at all times, (b) multiple owners can coexist, (c) owners can promote other members to owner. These constraints cannot be satisfied with a single `ownerId` pointer — they require the role to live in `ProjectMember`.

**Alternatives considered**:
- Keep `ownerId` as sole source of truth with a "transfer" operation. Rejected: does not support multiple owners.
- Synthetic `owner` role derived from `ownerId` at API response time. Rejected: requires parallel logic in every query; misleads callers into thinking `owner` is stored.

**Migration**: A Prisma migration adds `OWNER` to the enum and backfills all existing project creators: for each `Project`, find the `ProjectMember` whose `userId = project.ownerId` and set `role = OWNER`.

---

## 2. Delete Project

**Decision**: Add a `DeleteProjectUseCase` in `packages/domain`. Only members with `owner` role may delete. Deletion hard-deletes the `Project` record (cascade removes members and files via Prisma `onDelete: Cascade`). A `DELETE /api/projects/:id` route is added.

**Rationale**: No delete use case or route exists. Hard delete is correct for permanent deletion; the spec's two-step confirmation (typed project name) is the undo mechanism.

**Alternatives considered**:
- Soft delete (add `deletedAt` column). Rejected: spec says "project and all its data are removed" and users cannot access it; soft delete adds complexity without benefit since archive already covers the reversible case.

---

## 3. User Search for Invite Autocomplete

**Decision**: Add `GET /api/users/search?q=<query>&excludeProjectId=<id>` route that performs a case-insensitive prefix search on `User.displayName` and `User.email`. Results exclude users already in the project. Returns up to 10 matches. No dedicated `SearchUsersUseCase` is created in the domain; the route queries the `UserRepository` directly (read-only, no business rules involved).

**Rationale**: The spec (clarification Q2) requires autocomplete over registered users only, excluding current members. This is a read-only query with no invariants to enforce — placing it in a use case would add indirection without benefit.

**Alternatives considered**:
- Full-text search with PostgreSQL `tsvector`. Rejected: prefix/ILIKE search is sufficient for user lookup by name or email; adding tsvector is disproportionate for this use case.
- Search by email only. Rejected: users may not know colleagues' exact email; display name matching is more usable.

---

## 4. CSRF Token Coverage

**Decision**: All state-mutating frontend API calls (`membersApi.invite`, `membersApi.updateRole`, `membersApi.remove`, `projectsApi.update`, `projectsApi.archive`, `projectsApi.restore`, `projectsApi.delete`) must fetch and attach the CSRF token via the existing `getCsrfToken()` helper in `lib/api.ts`. The helper already caches the token for the page session.

**Rationale**: Currently only `authApi` sends CSRF tokens. The backend has CSRF validation middleware (`apps/api/src/plugins/csrf.ts`) which needs to be enabled for project and member mutation routes. SR-001 requires sessions not be stored client-side; CSRF tokens are the standard defence for session-cookie-based auth.

**Alternatives considered**:
- SameSite=Strict cookies as sole CSRF defence. Rejected: deployment topology may include cross-origin requests; explicit CSRF token is defence-in-depth.

---

## 5. Current User Identity in Client Components

**Decision**: Fetch the current user once in `apps/web/src/app/(dashboard)/layout.tsx` (which already runs server-side in App Router) via the existing `GET /auth/me` endpoint, serialize to a `currentUser` prop, and expose it through a `CurrentUserContext` React context. Client components consume it with a `useCurrentUser()` hook.

**Rationale**: Multiple components on the members page need the current user's `userId` to determine self-removal eligibility and the sole-owner warning. A shared context avoids redundant API calls.

**Alternatives considered**:
- Pass `currentUserId` as a prop through every page/component. Rejected: prop-drilling across deeply nested components; layout is the natural composition root.
- Fetch in each component independently. Rejected: redundant network requests; inconsistent UI if responses differ.

---

## 6. Confirmation Dialogs

**Decision**: Replace all `window.confirm()` calls with shadcn/ui `AlertDialog` (wrapping Radix `AlertDialog`). A reusable `ConfirmationDialog` component is extracted for destructive actions. The delete flow uses a specialized `DeleteProjectButton` component with a typed-name input gating the confirm button.

**Rationale**: `window.confirm()` blocks the thread, cannot be styled, and is inaccessible (screen readers handle it inconsistently). shadcn `AlertDialog` is already in the component library pattern; adding the `alert-dialog` primitive follows the established pattern.

**Alternatives considered**:
- Custom modal built from scratch. Rejected: Radix `AlertDialog` already provides accessible focus trapping and keyboard handling.

---

## 7. Archived Project Settings UX

**Decision**: The settings page passes `isArchived={!!project.archivedAt}` to `ProjectSettingsForm`. When `isArchived` is true, all form inputs are rendered with `disabled`, a prominent `AlertBanner` is displayed at the top, and only the `ArchiveButton` (restore mode) and `DeleteProjectButton` remain interactive.

**Rationale**: Spec (clarification Q5) explicitly chose this approach. Disabling fields (rather than hiding them) lets owners confirm current settings before restoring or deleting.

---

## 8. Role Dropdown Constraints

**Decision**: In `MemberList`, the role dropdown (`<select>`) is rendered with constraints:
- Only show `owner` option if the current user has `owner` role.
- If the current user's own row is displayed and they are the last owner, disable all options below `owner` with a `title` tooltip.
- The backend enforces all invariants; the frontend disabling is UX-only.

**Rationale**: SR-002 — server-side is authoritative. Client restrictions improve UX (prevent obviously-blocked actions) but are not the security boundary.
