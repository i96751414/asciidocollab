# Implementation Plan: Project Management Frontend

**Branch**: `009-project-mgmt-frontend` | **Date**: 2026-05-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-project-mgmt-frontend/spec.md`

## Summary

Add a complete project management frontend to the Next.js application, covering the project dashboard (role-aware cards, archive toggle), project settings page (name/description/tags with archived-state disabling), members management (role changes including the new `owner` role, member removal, sole-owner guard), invite flow (user-search autocomplete replacing free-text email), archive/restore, and permanent deletion with typed-name confirmation. Security is enforced server-side (role guards, CSRF tokens on all mutations) with client-side UX gates.

A prerequisite cross-cutting change is required before frontend work: adding `owner` as a first-class role across the Prisma schema, domain layer, shared package, and API routes. Significant frontend stubs already exist (dashboard page, settings page, members page, components) but lack role awareness, owner semantics, confirmation dialogs, and several missing features (delete, user-search invite, sole-owner warning, archived-state disabling).

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22 (monorepo with pnpm workspaces)

**Primary Dependencies**:
- Next.js 16 (App Router, `"use client"` for interactive components)
- shadcn/ui + Radix UI + Tailwind CSS (component library, design tokens)
- Zod (frontend form validation via `packages/shared` schemas)
- Jest + Testing Library (unit/component tests)
- Playwright (E2E tests in `apps/web/e2e/`)
- Prisma ORM (schema in `packages/db`, accessed only through infrastructure layer)

**Storage**: PostgreSQL via Prisma — one migration needed (add `OWNER` to `Role` enum)

**Testing**:
- Unit/component: Jest + Testing Library (`apps/web/tests/`)
- E2E: Playwright (`apps/web/e2e/`)
- Domain: Jest in-memory fakes (`packages/domain/tests/`)

**Target Platform**: Browser (Next.js SSR + client components, Fastify API backend)

**Project Type**: Web application (full-stack monorepo feature delivery)

**Performance Goals**: Pages interactive within 2 seconds on broadband (SC-006)

**Constraints**:
- All role checks enforced server-side; client UI gating is UX-only (SR-002)
- CSRF protection via `SameSite=Strict` session cookies + Fastify `Origin` header validation — no manual token system; port differences on the same host (`localhost:3000`/`4000`) are same-site, so this is safe for both dev and production
- Two-tier server-side access control (SR-005): (1) `apps/web/src/middleware.ts` handles **authentication only** — no session cookie → redirect to `/login`; (2) **project-role authorization** happens in each page's server component (App Router `async` page) by calling the Fastify API before rendering, redirecting to `/403` on insufficient role — Edge middleware cannot query PostgreSQL, so project-specific role checks must live in server components
- No `window.confirm()` — use shadcn `AlertDialog` for confirmations
- No `any` or `as` casts in production code (architecture P0 violations)

**Scale/Scope**: Single-tenant project list (no pagination of members); project management for a team-sized number of members per project

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| TDD (Red-Green-Refactor) | REQUIRED — tests must be written before every component, use case, and route change | No exceptions per constitution §II |
| Clean Architecture (strict inward deps) | PASS — frontend calls API via `lib/api.ts`; domain changes follow `Domain ← Application ← Infrastructure ← Delivery` | |
| Seam Testing with in-memory fakes | REQUIRED — new domain use cases (`delete-project`, updated `change-member-role`, `remove-member`) need in-memory fakes; in-memory fakes for `ProjectRepository` and `UserRepository` must also be updated with new `delete()` and `search()` methods before use-case tests are written | |
| Input validation at boundary | REQUIRED — Fastify schema validation on all new/updated API routes; Zod on all frontend forms | |
| RBAC in domain use cases only | REQUIRED — owner/admin guards live in use cases, not route handlers | SR-002 compliance |
| No business logic in route handlers | REQUIRED — new `delete-project` route must delegate to a use case | |
| No `any` / `as` in production | REQUIRED — enforce in all new and modified files | P0 violation |
| Typed errors, no info leaks | REQUIRED — new `CannotRemoveLastOwnerError`; all errors mapped through Fastify error handler | SR-004 |
| Conventional Commits | REQUIRED — granular commits per logical unit | |
| `pnpm lint` + `pnpm typecheck` green before commit | REQUIRED | |

No constitution violations identified. No complexity tracking entry needed.

## Project Structure

### Documentation (this feature)

```text
specs/009-project-mgmt-frontend/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── api-changes.md   # Phase 1 output — new and modified API endpoints
│   └── frontend-contracts.md  # Phase 1 output — component prop interfaces
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
packages/db/prisma/
├── schema.prisma                       # add OWNER to Role enum
└── migrations/
    └── <timestamp>_add_owner_role/     # migration SQL

packages/domain/src/
├── value-objects/
│   └── role.ts                         # add 'owner' to valid values
├── errors/
│   ├── cannot-remove-last-owner.ts     # new error
│   └── index.ts                        # export new error
├── use-cases/
│   ├── change-member-role.ts           # update: owner caller support; owner-role assignment; last-owner guard
│   ├── remove-member.ts                # update: owner caller support; last-owner guard (role-based)
│   ├── delete-project.ts               # new: owner-only hard delete
│   └── index.ts                        # export new use case

packages/shared/src/
├── dtos/
│   ├── project-management.dto.ts       # add owner to role union; add DeleteProjectResultDto
│   ├── user-search.dto.ts              # new: UserSearchResultDto
│   └── index.ts                        # export new DTO
├── schemas/
│   └── project.ts                      # add owner to role enums in inviteMemberSchema + updateMemberRoleSchema
└── types/ (no change)

apps/api/src/
├── plugins/
│   └── origin-check.ts                 # new: Fastify hook — validate Origin header on all mutating routes
├── index.ts                            # update: register origin-check plugin; set SameSite=Strict on session cookie
└── routes/
    ├── projects.ts                     # add DELETE /api/projects/:id route
    └── projects/
        ├── members.ts                  # update POST + PATCH to accept owner role
        └── users-search.ts             # new: GET /api/users/search?q=...&excludeProjectId=...

apps/web/
├── src/
│   ├── middleware.ts                   # new: authentication-only redirect (no session → /login); project-role checked in server components
│   ├── app/
│   │   └── 403/
│   │       └── page.tsx               # new: static "Not Authorised" page with link back to dashboard
│   ├── lib/
│   │   ├── api.ts                      # add owner role types; projectsApi.delete; usersApi.search; remove ALL getCsrfToken() calls
│   │   └── get-project-access.ts      # new: server-side helper — fetches project + caller membership, returns role or redirects to /403
│   ├── contexts/
│   │   └── current-user-context.tsx    # new: React context for current user identity
│   ├── hooks/
│   │   └── use-current-user.ts         # new: hook consuming CurrentUserContext
│   ├── components/
│   │   ├── ui/
│   │   │   └── alert-dialog.tsx        # new: shadcn AlertDialog component
│   │   ├── confirmation-dialog.tsx     # new: reusable destructive-action dialog
│   │   ├── user-search-combobox.tsx    # new: autocomplete for registered users
│   │   ├── delete-project-button.tsx   # new: typed-name confirmation + delete
│   │   ├── sole-owner-warning.tsx      # new: banner when current user is sole owner
│   │   ├── member-list.tsx             # update: owner role, self-remove guard, Dialog confirmation
│   │   ├── invite-member-form.tsx      # update: replace email input with UserSearchCombobox
│   │   ├── archive-button.tsx          # update: Dialog confirmation, error display
│   │   ├── project-settings-form.tsx   # update: archive banner + disabled-when-archived
│   │   └── project-card.tsx            # update: settings link for admin/owner
│   └── app/(dashboard)/
│       ├── layout.tsx                  # update: fetch and provide CurrentUser context
│       └── dashboard/
│           ├── page.tsx                # update: "Create Project" button always visible; archived toggle; deletion success toast
│           └── projects/[id]/
│               ├── settings/
│               │   ├── page.tsx        # update → async server component: calls getProjectAccess(); redirects viewer/editor to /403; renders SettingsClient
│               │   └── settings-client.tsx  # new: extract current "use client" logic into client component receiving project + role as props
│               └── members/
│                   ├── page.tsx        # update → async server component: calls getProjectAccess(); redirects viewer/editor to /403; renders MembersClient
│                   └── members-client.tsx   # new: extract current "use client" logic into client component receiving members + role as props
└── tests/
    ├── components/
    │   ├── member-list.test.tsx        # new tests
    │   ├── invite-member-form.test.tsx # new tests
    │   ├── delete-project-button.test.tsx  # new tests
    │   ├── project-settings-form.test.tsx  # new tests
    │   └── sole-owner-warning.test.tsx     # new tests
    └── lib/
        └── api.test.ts                 # update: owner role, new endpoints
```

**Structure Decision**: Monorepo web-application option. Changes span `packages/` (domain, shared, db) and `apps/` (api, web). The frontend is a Next.js App Router application in `apps/web`; all interactive project management components use `"use client"`.
