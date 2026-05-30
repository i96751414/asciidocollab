# Research: Authentication UI & Session Flows

## Existing Backend — What Is Already Built

All auth backend work from Phase 3 is complete. The following route handlers exist
and are fully implemented but are NOT yet registered in `buildServer()`:

| Route | File | Status |
|---|---|---|
| `POST /auth/login` | `apps/api/src/routes/login.ts` | Implemented, not registered |
| `POST /auth/register` | `apps/api/src/routes/register.ts` | Implemented, not registered |
| `POST /auth/logout` | `apps/api/src/routes/logout.ts` | Implemented, not registered |
| `GET /auth/me` | `apps/api/src/routes/me.ts` | Implemented, not registered |
| `POST /auth/password-change` | `apps/api/src/routes/password-change.ts` | Implemented, not registered |
| `POST /auth/password-reset-request` | `apps/api/src/routes/password-reset-request.ts` | Implemented, not registered |
| `POST /auth/password-reset` | `apps/api/src/routes/password-reset.ts` | Implemented, not registered |
| `GET/POST/PATCH /api/projects` | `apps/api/src/routes/projects.ts` | Implemented, not registered |
| `GET/POST/PATCH/DELETE /api/projects/:id/members` | `apps/api/src/routes/projects/members.ts` | Implemented, not registered |

**Decision**: Register all existing routes in `buildServer()` as part of this phase.
All route handlers are already complete; this is purely a wiring task.

---

## Known Bugs to Fix

### Bug 1 — Session cookie name mismatch in `proxy.ts`

`apps/web/src/proxy.ts` checks `request.cookies.get("session")` but
`@fastify/session` sets the cookie as `sessionId` (the default name, confirmed
by `apps/api/src/routes/logout.ts` calling `reply.clearCookie('sessionId')`).

**Fix**: Change the cookie name in `proxy.ts` to `"sessionId"`.

### Bug 2 — `proxy.ts` is not wired as Next.js middleware

The file exists at `apps/web/src/proxy.ts` but Next.js edge middleware must live at
`apps/web/src/middleware.ts`. There is currently no `middleware.ts`.

**Fix**: Rename/move to `apps/web/src/middleware.ts` (or create `middleware.ts`
that re-exports from `proxy.ts`).

### Bug 3 — `api.ts` API_BASE_URL defaults to port 3001

`apps/web/src/lib/api.ts` defaults to `http://localhost:3001` but the Fastify API
runs on port 4000. 

**Fix**: Change default to `http://localhost:4000`.

---

## First-Run Detection

**Question**: How does the web app know whether to redirect to the setup/register
page vs. the login page when a user is unauthenticated?

**Decision**: Add a new public API endpoint `GET /auth/setup-status` that returns
`{ "configured": true|false }`. The login page (server component) calls this on
render. If `configured: false`, it redirects to `/register`.

**Why a new endpoint instead of client-side detection**: The frontend cannot
determine if any users exist without calling the API. This check is safe to expose
publicly (it reveals no user data — only whether the system has been initialised).

**Rationale**: Keeping first-run logic in the login page (server component) rather
than in edge middleware avoids making async API calls in the hot middleware path,
keeping middleware fast and edge-runtime compatible.

---

## New Domain Addition: `UserRepository.hasAny()`

**Question**: How does `CheckSystemSetupUseCase` determine if users exist?

**Decision**: Add `hasAny(): Promise<boolean>` to the `UserRepository` interface.
Rationale: a count query on the users table is the correct domain primitive.
The use case wraps it in business context ("is the system configured?") and
returns a typed result.

**Alternatives considered**:
- `count(): Promise<number>` — More general, but the number itself has no
  business meaning in this context; the boolean is the correct abstraction.
- Checking in the route handler directly — Violates architecture: business logic
  must live in use cases.

---

## Register Page — First-Run Only

**Question**: Should there be a separate `/setup` page for first-run, or can
the existing `/register` page directory serve both purposes?

**Decision**: Use `/register` for first-run setup only. Registration is closed
once any user exists (`hasAny()` returns `true`). The page shows "Set up your
account" messaging. When a configured system is detected and the visitor has no
session, the page redirects to `/login` (FR-008).

**Rationale**: Registration being permanently closed post-setup (FR-008) makes
"dual-purpose" moot — the page will never show standard registration messaging.
The redirect ensures the route is fully inaccessible after setup, at both the
API level (403) and the UI level.

---

## Next.js Middleware Pattern

**Decision**: Edge middleware at `apps/web/src/middleware.ts` performs a fast,
synchronous cookie-existence check only — no async API calls. It handles:
- Protected paths (`/dashboard/**`, future authenticated routes)
- Redirect to `/login?redirect=<original-path>` when `sessionId` cookie is absent

Server components in the dashboard layout call `GET /auth/me` to validate the
session on every SSR render. This two-layer approach is standard Next.js practice:
edge middleware for fast rejection, server component for authoritative validation.

---

## Post-Login Redirect

**Decision**: The login page reads the `redirect` query parameter and navigates
there after a successful login. The value is validated: it MUST start with `/`
and MUST NOT start with `//` (which would be a protocol-relative external URL).
Anything that fails validation falls back to `/dashboard`.

**Rationale**: The `starts with / but not //` rule is the standard open-redirect
mitigation — simple, testable, and covers all known bypass variants (absolute
URLs, protocol-relative URLs, `\` prefix tricks). A static allowlist would be
more restrictive but unworkable given dynamic project routes.

---

## Session Expiry UX

**Decision**: When `GET /auth/me` returns 401 from a server component (session
expired), the server component redirects to `/login?reason=expired`. The login
page shows a dismissable notice when this parameter is present.

---

## CSRF Protection

The Fastify server already registers `@fastify/csrf-protection`. The login and
register forms POST to the API with `credentials: "include"` and the
`Content-Type: application/json` header. CSRF tokens are validated server-side.

**Gap identified**: Registering the plugin is not the same as enforcing it. Each
POST route must explicitly require the token. Integration tests MUST include a
case asserting `403 Forbidden` when the CSRF token header is absent from
`POST /auth/login`, `POST /auth/register`, and `POST /auth/logout` (FR-014).

---

## Session Cookie — SameSite Policy

**Decision**: `SameSite=Strict` is required (FR-015).

**Rationale**: This is a self-hosted, single-origin deployment. Users never reach
the app via cross-site top-level navigation from external links in a security-
sensitive context. `Strict` prevents the session cookie from being sent on any
cross-site request — including top-level navigations — fully closing the cross-
site logout and CSRF attack surface. `Lax` (the current default) is explicitly
rejected per the clarification session.

**Change required**: Update `sameSite: 'lax'` → `sameSite: 'strict'` in
`apps/api/src/plugins/auth.ts` (or the session config location).

---

## Registration Closed Error — Domain Error Type

**Decision**: Add `RegistrationClosedError` to `packages/domain/src/errors/`.

**Rationale**: `RegisterUserUseCase.execute()` needs a typed error to signal that
registration is unavailable post-setup. `RegistrationClosedError extends DomainError`.
The register route maps it to `403 Forbidden` with code `REGISTRATION_CLOSED`.

**Race condition handling**: The `hasAny()` check runs first. If a concurrent
INSERT causes a unique-constraint DB violation, `RegisterUserUseCase` catches it,
re-calls `hasAny()`, and returns `RegistrationClosedError` if `true`. This avoids
needing a serializable transaction while still producing the correct outcome.

---

## Testing Strategy (TDD)

| Layer | Test type | Tool |
|---|---|---|
| `CheckSystemSetupUseCase` | Unit (with InMemoryUserRepository) | Jest |
| `UserRepository.hasAny()` — fake | Unit | Jest |
| `GET /auth/setup-status` | Integration (testcontainers) | Jest |
| Login/register/logout routes | Integration (testcontainers) | Jest |
| Login form | Component (jsdom) | Testing Library |
| Register form | Component (jsdom) | Testing Library |
| Full auth flows | E2E | Playwright |
