# Quickstart: Account Management & Password Forms

**Feature**: 008-account-password-forms
**Date**: 2026-05-31

---

## Prerequisites

Standard development environment for this repo. See the project README for initial setup.

```bash
pnpm install
pnpm db:generate   # regenerate Prisma client after schema changes
pnpm db:migrate    # run the new EmailChangeToken migration
```

---

## New Pages

| URL | Auth Required | Description |
|-----|--------------|-------------|
| `/forgot-password` | No | Enter email to receive a password reset link |
| `/reset-password?token=…` | No | Set a new password using a reset token |
| `/email/confirm?token=…` | No | Confirms an email change (Server Component, renders result) |
| `/dashboard/account` | Yes | Account management: display name, email, password cards |

---

## Running Locally

```bash
pnpm dev   # starts both apps/api (port 4000) and apps/web (port 3000)
```

### Try the forgot-password flow
1. Go to `http://localhost:3000/login`
2. Click "Forgot password?" link
3. Enter a registered email — the API logs the reset URL to stdout in development
4. Visit the reset URL to set a new password

### Try the account management page
1. Log in at `http://localhost:3000/login`
2. Click "Account" in the sidebar
3. Each card saves independently — try updating the display name, then the password

### Try the email change flow
1. On the account page, enter a new email in the Email card and save
2. The API logs the confirmation URL to stdout in development
3. Visit the confirmation URL — you will be redirected to `/dashboard/account` with a success notice

---

## Running Tests

```bash
# All tests
pnpm test

# Domain unit tests only (fast, no Docker)
pnpm --filter @asciidocollab/domain test

# API integration tests (requires Docker for testcontainers)
pnpm --filter api test

# Frontend utility tests
pnpm --filter web test
```

### New test files

| File | What it covers |
|------|---------------|
| `packages/domain/src/entities/email-change-token.test.ts` | Entity invariants, computed properties |
| `packages/domain/src/use-cases/request-email-change.test.ts` | Happy path, supersede, enumeration prevention, invalid email |
| `packages/domain/src/use-cases/confirm-email-change.test.ts` | Happy path, expired token, used token, wrong user |
| `packages/domain/src/use-cases/update-display-name.test.ts` | Happy path, empty name, name too long |
| `apps/api/tests/profile-update.test.ts` | 200 success, 400 validation, 401 unauth |
| `apps/api/tests/email-change.test.ts` | Full flow, rate limit, invalid token, enumeration |
| `apps/web/tests/lib/password-schema.test.ts` | Policy enforcement, all rule combinations |
| `apps/web/tests/hooks/use-touched-fields.test.ts` | touch/touchAll/isTouched behaviour |

---

## TDD Workflow (per layer)

For each new piece of backend code, follow this order:

1. Write the domain entity/use-case test (fails — red)
2. Implement the entity/use-case (green)
3. Write the API integration test (fails — red)
4. Implement the route + wire up the use-case (green)
5. Refactor

For frontend utilities:

1. Write the test for `buildPasswordSchema` / `useTouchedFields` (fails — red)
2. Implement the utility (green)
3. Update `register-form.tsx` to use the extracted utility — existing register tests confirm no regression

---

## Security Checklist (verify before PR)

- [ ] All new mutating API routes require `x-csrf-token` header
- [ ] All new authenticated routes return 401 when session is absent
- [ ] `POST /auth/email/change-request` returns 200 regardless of whether the email is registered
- [ ] Confirmation token is not present in any server-side logs
- [ ] `pendingEmail` is read from the database on confirm — never from the URL
- [ ] Rate limiting is applied to `POST /auth/email/change-request`
- [ ] Negative tests for all token error states pass
