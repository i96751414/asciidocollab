# Quickstart: Authentication UI & Session Flows

After implementation, this is how the feature works end-to-end.

## First-run (trial setup)

```
1. Start the app:      ./scripts/dev.sh
2. Open browser:       http://localhost:3000
3. Auto-redirect:      → /register  (system has no users yet)
4. Fill the form:      Name, email, password
5. Submit:             → account created, auto-signed in
6. Auto-redirect:      → /dashboard  (projects list)
```

## Sign in (returning user)

```
1. Open browser:       http://localhost:3000/dashboard  (or any protected page)
2. Auto-redirect:      → /login?redirect=/dashboard
3. Enter credentials:  email + password
4. Submit:             → signed in
5. Auto-redirect:      → /dashboard  (original destination)
```

## Sign out

```
1. From any page:      Click "Sign Out" in the sidebar
2. Session destroyed:  → /login
```

## Session expiry

```
1. Leave browser idle past session timeout (default: 30 min)
2. Navigate to any page
3. Auto-redirect:      → /login?reason=expired
4. Notice shown:       "Your session has expired. Please sign in again."
```

## Testing the setup status endpoint

```bash
# Before any users exist:
curl http://localhost:4000/auth/setup-status
# → { "configured": false }

# After first user is registered:
curl http://localhost:4000/auth/setup-status
# → { "configured": true }
```

## Running the tests

```bash
# Domain unit tests (fast, no DB)
pnpm --filter @asciidocollab/domain test

# API integration tests (requires Docker for testcontainers)
pnpm --filter @asciidocollab/api test

# Web component tests
pnpm --filter @asciidocollab/web test

# E2E (requires the dev stack to be running)
pnpm --filter @asciidocollab/web e2e
```
