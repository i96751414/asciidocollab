# API Contracts: Project Management Frontend

**Feature**: `009-project-mgmt-frontend` | **Date**: 2026-05-31

## New Endpoints

### DELETE /api/projects/:id

**Auth**: Session required. Actor must have `owner` role in the project.

**Params**: `id` — project UUID

**Request body**: none

**Responses**:

| Status | Code | Body |
|--------|------|------|
| 200 | — | `{ "data": { "id": "<uuid>" } }` |
| 401 | `UNAUTHORIZED` | Not authenticated |
| 403 | `FORBIDDEN` | Not an owner of this project |
| 404 | `NOT_FOUND` | Project not found |

---

### GET /api/users/search

**Auth**: Session required.

**Query params**:
- `q` (required, min 2 chars) — search query matched against `displayName` and `email` (case-insensitive prefix/contains)
- `excludeProjectId` (optional) — project UUID; exclude users already in this project

**Responses**:

| Status | Code | Body |
|--------|------|------|
| 200 | — | `{ "data": { "users": [{ "userId": "...", "displayName": "...", "email": "..." }] } }` |
| 400 | `VALIDATION_ERROR` | `q` missing or too short |
| 401 | `UNAUTHORIZED` | Not authenticated |

**Max results**: 10

---

## Modified Endpoints

### POST /api/projects/:id/members (invite)

**Change**: `role` enum now accepts `"owner"` in addition to `"viewer"`, `"editor"`, `"administrator"`.

**Authorization change**: Only callers with `owner` role may assign `role: "owner"` to the invitee. Callers with `administrator` role may only assign `viewer | editor | administrator`.

**Fastify schema update**:
```json
"role": { "type": "string", "enum": ["viewer", "editor", "administrator", "owner"] }
```

---

### PATCH /api/projects/:id/members/:userId (change role)

**Change**: `role` enum now accepts `"owner"`. Same authorization rule as above.

**Additional validation**: If the new role would leave the project with zero owners (demoting the last owner), returns `400 CANNOT_REMOVE_LAST_OWNER`.

**Fastify schema update**:
```json
"role": { "type": "string", "enum": ["viewer", "editor", "administrator", "owner"] }
```

---

### GET /api/projects/:id/members (list members)

**Change**: `role` field in each member object now includes `"owner"` as a possible value. No schema change required — already returns a `string`.

---

## CSRF Protection Approach

**Replaced**: The manual `x-csrf-token` header system is replaced with `SameSite=Strict` cookies + server-side `Origin` header validation. No per-call token is needed.

### Session Cookie Change

The Fastify session plugin must set `sameSite: 'strict'` on the session cookie. This is safe for the `localhost:3000` → `localhost:4000` development topology because port is not part of the "site" (eTLD+1); both addresses are same-site.

### Origin Validation Hook

A Fastify `preHandler` hook (`apps/api/src/plugins/origin-check.ts`) validates the `Origin` header against `process.env.FRONTEND_URL` for all `POST`, `PATCH`, `PUT`, and `DELETE` requests:

```ts
fastify.addHook('preHandler', async (request, reply) => {
  const mutating = ['POST', 'PATCH', 'PUT', 'DELETE'];
  if (mutating.includes(request.method)) {
    const origin = request.headers.origin;
    if (origin !== process.env.FRONTEND_URL) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Request origin not permitted' } });
    }
  }
});
```

### Frontend Change

Remove all `getCsrfToken()` calls from `apps/web/src/lib/api.ts`. The `GET /auth/csrf-token` endpoint and the `csrfToken` cache variable are no longer needed.

| Route | Action |
|-------|--------|
| All mutating routes | Protected by `SameSite=Strict` cookie + Origin check — no token header needed |
| `GET /auth/csrf-token` | Can be deprecated once the new approach is deployed |
