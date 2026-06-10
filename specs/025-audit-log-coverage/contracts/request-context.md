# Contract: RequestContext (FR-017)

## DTO — `packages/shared/src/request-context.ts`

```ts
/** Origin of an authenticated request, threaded into audit metadata. */
export interface RequestContext {
  readonly ipAddress?: string;
  readonly userAgent?: string;
}
```

## Builder — `apps/api/src/lib/request-context.ts`

```ts
export function requestContextFrom(request: FastifyRequest): RequestContext {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  };
}
```

`request.ip` already reflects the configured proxy/`X-Forwarded-For` trust at the Fastify level.

## Usage in audited use cases

- Audited use cases accept an **optional** `context?: RequestContext` parameter.
- The context is folded into the audit record metadata under a stable key:
  `metadata.origin = { ipAddress, userAgent }` (omitted keys when undefined).
- Background/system-initiated actions (no HTTP request) omit the parameter — the record simply has no `origin` (FR-017 "where available").

## Contract rules

- **CR-1**: Routes that call an audited use case MUST pass `requestContextFrom(request)`.
- **CR-2**: The domain MUST treat `RequestContext` as untrusted display data — it is stored, never used for authorization.
- **CR-3**: `RequestContext` MUST NOT carry secrets (it is limited to ip + user-agent by type).
- **CR-4**: `origin` is additive metadata — it MUST NOT replace existing event-specific metadata (before/after values are merged alongside it).
