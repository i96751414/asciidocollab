# Contract: Internal Collaboration Auth Endpoint

**Route**: `GET /internal/collab/auth`
**Consumer**: `apps/collab` auth-hook extension
**Provider**: `apps/api` — internal Fastify server (loopback only)

---

## Network Isolation

This route is registered **exclusively** on a second Fastify server instance in `apps/api/src/internal-server.ts`, bound to `127.0.0.1:<ASCIIDOCOLLAB_COLLAB_INTERNAL_PORT>` (default 4001). It is NOT registered on the public-facing Fastify server. The reverse proxy MUST NOT forward traffic to this port.

The internal server registers only:
- The session plugin (for cookie validation)
- This route

It does NOT register CSRF, origin-check, or rate-limit plugins.

---

## Fastify Route Schema

```typescript
schema: {
  querystring: {
    type: 'object',
    required: ['documentName'],
    properties: {
      documentName: {
        type: 'string',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: { role: { type: 'string', enum: ['editor', 'observer'] } },
      required: ['role'],
    },
  },
}
```

The UUID v4 regex pattern validates both halves of `documentName` before any domain logic runs. Fastify returns 400 automatically for non-matching values.

---

## Request

| Parameter | Location | Type | Description |
|-----------|----------|------|-------------|
| `documentName` | Query | `string` | Room identifier in `<projectId>/<yjsStateId>` format; both parts must be UUID v4 |
| `Cookie` | Header | `string` | Forwarded verbatim from the WebSocket handshake headers |

Example:
```
GET /internal/collab/auth?documentName=550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440002
Cookie: sessionId=abc123
```

---

## Responses

### 200 OK — Connection authorised

```json
{
  "role": "editor"
}
```

`role` is `"editor"` for members with write access, `"observer"` for read-only members (viewers).

### 400 Bad Request — Malformed `documentName`

Returned by Fastify schema validation before any handler code runs.

```json
{ "message": "querystring/documentName must match pattern \"...\"" }
```

### 401 Unauthorized — No valid session

```json
{ "error": "Unauthorized" }
```

### 403 Forbidden — Valid session but user is not a project member

```json
{ "error": "Not a member of this project" }
```

---

## Auth Hook Behaviour (`apps/collab`)

The auth hook in `apps/collab/src/extensions/auth-hook.ts` MUST:

1. Forward the WebSocket handshake `Cookie` header verbatim to the internal API call.
2. Wrap the HTTP call with `AbortSignal.timeout(ASCIIDOCOLLAB_COLLAB_AUTH_TIMEOUT_MS)` (default 3000 ms).
3. On 200: extract `role` from the response body; store it on the Hocuspocus connection context for use by the persistence extension to gate write operations.
4. On 401 or 403: reject the WebSocket connection with close code 1008 (policy violation).
5. On timeout or any network error: reject the WebSocket connection with close code 1008 and log a `warn` entry including the room name and error class — but **never** the forwarded cookie value.

---

## Security

- **Network isolation**: Bound to loopback only; not reachable from the internet or Docker-external networks.
- **No CSRF/origin-check**: Not needed — the caller is `apps/collab` server process, not a browser.
- **Cookie handling**: The `Cookie` header is forwarded to enable session validation but MUST NOT appear in any log. `apps/collab`'s Pino logger MUST redact `req.headers.cookie` and `req.headers.Cookie`. The HTTP client making the call MUST suppress header logging.
- **Input validation**: UUID v4 pattern enforced by Fastify schema before any handler or domain code runs.
