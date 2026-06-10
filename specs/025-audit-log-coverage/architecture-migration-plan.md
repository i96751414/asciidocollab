# Authorization-Denial Logging Migration Plan

Incremental strategy for satisfying the Security Constitution's MUST — "All authorization denials MUST be logged with actor, resource, and reason" — without a big-bang sweep across every use case, and without expanding this feature's primary scope uncontrollably.

## Current State

```
Use case (e.g. DeleteFileUseCase)
  └─ permission check ──fail──> returns Result.err(ForbiddenError)   ← silently returns; no audit
                       └─pass─> performs action ──> writes AuditLog   ← only success is audited
```

### Problems

- The Security Constitution MUST ("authorization denials MUST be logged with actor, resource, and reason") is unmet.
- Denials are invisible: a user repeatedly probing resources they cannot access leaves no trail — the exact signal an audit system exists to capture.
- The gap sits in a feature explicitly chartered to make audit coverage "sufficient", so the deviation is conspicuous.

## Target State

```
Use case
  └─ permission check ──fail──> returns Result.err(ForbiddenError{resourceType, resourceId, reason})
  │                                 └─> Route records authz.denied (+actor, +origin) best-effort
  └─pass─> performs action ──> writes AuditLog (success, unchanged)
```

A single shared recorder (`RecordAuditEventUseCase`) is invoked at the **route boundary** when a use case returns `ForbiddenError`, so each boundary adds one line, not a bespoke block. The permission check itself stays in the use case (Security Constitution).

### Benefits

- Closes the Constitution MUST with a uniform, testable pattern.
- One recorder = consistent denial record shape (no per-use-case drift).
- Denial volume is naturally bounded by the same route rate limits; records reuse the existing `AuditLog` store with a dedicated action (`authz.denied`) that admins can filter.

## Migration Phases

### Phase 1: Pattern + first boundary (Estimated: 1 day)
**Goal**: Establish the denial-recording pattern on one high-value boundary, fully tested.

- **Task 1.1**: Add an `authz.denied` action constant and define the denial record shape (actor, `resourceType`, `resourceId`, `reason`, `origin`) reusing the existing `AuditLog` entity + `AuditLogRepository`.
- **Task 1.2**: Enrich the typed `ForbiddenError` to carry `resourceType`, `resourceId`, and `reason`, and record `authz.denied` at the **route boundary** (best-effort, via the shared `RecordAuditEventUseCase`) when a use case returns that error — keeping the permission check in the use case.
- **Task 1.3**: Apply it to the file-tree mutation boundary (delete/move/create) — record on the permission-denied branch; cover with use-case tests asserting a denial record with actor/resource/reason.

**Coexistence**: Only the file-tree boundary records denials; all other use cases keep returning `Result.err` with no denial record. Both states are valid — no consumer depends on universal coverage yet.

### Phase 2: Project, membership & settings boundaries (Estimated: 1–2 days)
**Goal**: Extend the same recorder to the remaining authorization-bearing use cases.

- **Task 2.1**: Apply the recorder to project lifecycle and membership/role use cases (the other RBAC checks).
- **Task 2.2**: Apply to admin/settings use cases guarded by `requireAdmin`.
- **Task 2.3**: Add admin-review filter coverage so `authz.denied` is visible/filterable in the existing audit-log screen.

**Coexistence**: Boundaries migrate one module at a time; the recorder is identical everywhere, so partially-migrated state is consistent in shape, just narrower in coverage.

## Coexistence Strategy

**Why coexistence?** Authorization checks are spread across many use cases; a single sweeping edit would be high-risk and unreviewable.

**How**:
- New/migrated routes record `authz.denied` via the shared `RecordAuditEventUseCase` when their use case returns a `ForbiddenError`.
- Un-migrated use cases keep returning `Result.err` unchanged.
- The recorder is best-effort (a denial-record write failure never changes the `Result.err` returned to the caller) — consistent with the spec's "action stands / failure surfaced" stance, applied here to the denial path.
- The denial records share the existing `AuditLog` store and admin API, so no new read surface is required.

## Rollback Plan

The recorder is additive and injected. If it misbehaves, remove the injected recorder calls (or no-op the recorder implementation); use cases revert to returning `Result.err` exactly as today. No schema change is involved (`authz.denied` reuses `AuditLog`), so there is nothing to migrate back.

## Success Criteria

- [ ] Authorization-denial records are written for file-tree, project, membership, and admin/settings boundaries.
- [ ] Each denial record carries actor, resourceType, resourceId, and reason (Constitution MUST satisfied).
- [ ] `authz.denied` is filterable in the admin audit-log review.
- [ ] Denial recording is best-effort and never alters the returned `Result.err`.
- [ ] Tests cover at least one denial path per migrated boundary; lint/typecheck/tests green.
