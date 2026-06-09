# Implementation Plan: Real-time Co-editing (Editor Integration)

**Branch**: `020-realtime-co-editing` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-realtime-co-editing/spec.md`

## Summary

Bind the existing CodeMirror 6 AsciiDoc editor in `apps/web` to the collaboration server (`apps/collab`, spec 018) so multiple users edit a file in real time, see each other's cursors/selections, and undo only their own edits. The collaboration server already exists; this feature is the **client-side integration** plus **one additive API endpoint**.

The editor currently uses a REST load/save model (`GET /content` → CodeMirror → debounced `PUT /content` autosave + ETag polling + localStorage drafts). That model conflicts with the collaboration server, which now owns persistence and rejects writes to actively-edited files (018 FR-011, already implemented as a 409). The core of this plan is to introduce a **collab editing path** that replaces REST load/save with a Yjs binding when a file is a collaborative document, while keeping the REST path as the read-only / binary-asset / offline fallback.

This plan also discharges spec 018's deferred **FR-012** (read-only fallback when the collab server is unreachable) and inventories the **5 deferred Playwright E2E specs** for sequencing in `/speckit-tasks`.

## Technical Context

**Language/Version**: TypeScript 5.x; Node 20+ (`apps/api`, `apps/collab`); Next.js 16 App Router (`apps/web`)

**Primary Dependencies**:
- *New (web)*: `yjs` (pin to `^13.6.31` to match `apps/collab` — exactly one Yjs instance must exist in the web bundle), `@hocuspocus/provider`, `y-codemirror.next`, `y-protocols` (awareness).
- *Existing*: CodeMirror 6 (`@codemirror/{state,view,commands,...}`), Fastify, Prisma, `@hocuspocus/server` (collab).

**Storage**: PostgreSQL via Prisma — reuses existing `Document.yjsStateId`, `Document.contentId`, and `CollaborationSession`. **No schema change, no migration.** Yjs state + file write-back handled by the existing collab persistence extension.

**Testing**: Jest + Testing Library (domain use case with in-memory fakes; API route integration; web hooks/components); Playwright (the 5 E2E specs).

**Target Platform**: Modern evergreen browsers (web client); Linux server (api/collab).

**Project Type**: Web application — modular-monolith monorepo (`apps/web`, `apps/api`, `apps/collab`, `packages/*`).

**Performance Goals**: Remote edit visible to others < 1 s (SC-001); late-joiner sees full state < 2 s (SC-002); convergence to identical text for all clients (SC-003).

**Constraints**:
- Exactly one `yjs` instance in the web bundle (duplicate Yjs silently breaks CRDT).
- WS authentication relies on the browser auto-sending the session cookie on the handshake — requires collab + web to be same-site (cookies are port-agnostic in dev; production needs same registrable domain / reverse proxy).
- No `any`, no `as` casts in production (Architecture Constitution P0 rules 5–6).
- Business logic in domain use cases only; route handlers delegate (P0 rule 2).
- Tests under `tests/` mirroring source; no `__tests__/` (P0 rule 7).

**Scale/Scope**: Small concurrent editor groups per document; single-instance collab deployment (consistent with 018).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Governance Constitution (v2.0.0)**

| Principle | Compliance |
|-----------|-----------|
| I. Clean Code | New code uses typed domain errors (`Result<T,E>`), named constants (debounce/timeout/room-format), small single-purpose hooks (`useCollabDocument`, `useCollabPresence`). |
| II. TDD (NON-NEGOTIABLE) | Every unit of production code is preceded by a failing test: domain use case (`GetDocumentCollabInfoUseCase`) with in-memory fakes; API route integration test; web hook/component tests; the 5 Playwright E2E specs. `/speckit-tasks` will order test-before-impl. |
| III. Seam testing with in-memory fakes | The new use case depends only on existing ports (`DocumentRepository`, `ProjectMemberRepository`, `FileNodeRepository`), all of which already have in-memory fakes. No new ports needed. |

**Architecture Constitution (v2.4.0)**

| Rule | Compliance |
|------|-----------|
| Layer boundaries / dependency rule | New use case in `packages/domain`; route in `apps/api` delegates; web is delivery only. |
| Business logic placement | Role mapping (viewer→observer) + membership/document checks live in `GetDocumentCollabInfoUseCase`, not the route. |
| Contracts in `shared` | `CollabDocumentInfo` DTO added to `packages/shared/src/dtos/collab.dto.ts` (reuses existing `CollabAuthRole`). No duplication. |
| Technology mandates | CodeMirror 6 + y-codemirror.next + Yjs/Hocuspocus — exactly the mandated stack. |
| Data access | Reads via existing Prisma-backed repos; no raw SQL. |
| Migration policy | **No schema change** — `yjsStateId` already exists on `Document`. Nothing to migrate. |
| Test layout | Domain tests in `packages/domain/tests/use-cases/content/`; API tests in `apps/api/tests/routes/`; web tests in `apps/web/tests/`; E2E in `apps/web/e2e/`. |
| P0 (no any/as) | y-codemirror/yjs typings used directly; the `apps/collab` `createRequire` workaround is **not** needed in the web ESM bundle (Next.js bundler resolves `yjs` as ESM). Verified in Phase 0. |

**Security Constitution (v1.0.0)** — the collaboration WebSocket (`apps/collab`, port 4002) is browser-facing and listens directly via Hocuspocus (not behind Fastify), so it inherits none of the API's protections. Phase 7 (Security & Ops Hardening) addresses the applicable MUSTs:

| Security MUST | Compliance |
|---------------|-----------|
| §API — Rate limiting on all public endpoints | REST `GET …/collab` inherits the global API rate-limit plugin; the public **WS** gets in-app per-user connection/room caps + connect-rate limiting in the Hocuspocus `onConnect` seam (tasks T053–T055). |
| §API — CORS / allowed origins only | WS handshake gains an `Origin` allowlist (`ASCIIDOCOLLAB_COLLAB_ALLOWED_ORIGINS`) + session-cookie `SameSite` lock against cross-site WS hijacking (T056–T057). |
| §API — Request size limits enforced | WS max-payload guard on inbound Yjs messages (`ASCIIDOCOLLAB_COLLAB_MAX_PAYLOAD_BYTES`, T058–T059). |
| §Audit — Authorization denials logged (actor, resource, reason) | Collab auth-path 403s + observer write-rejections logged with actor/resource/reason; cookie/secret redaction preserved (T060–T061). |
| §Trust Boundaries — TLS at the edge | Public WS documented to require `wss://` in production; internal Fastify↔Hocuspocus stays plain HTTP per the constitution (T063). |
| §Authz — RBAC in domain | Role mapping + membership checks live in `GetDocumentCollabInfoUseCase`, not the route. |
| §Data isolation | Endpoint is project-scoped; membership verified before returning `yjsStateId`. |

**Result**: PASS. No violations. The public-WS hardening (rate-limit, origin, payload, audit) is mandatory and scheduled in Phase 7 (blocking before merge). No Complexity Tracking entries required.

## How this plan resolves the file-access review findings

| Finding | Resolution in design |
|---------|----------------------|
| **B1** Client cannot get `yjsStateId`/role | New `GET /projects/:projectId/files/:fileNodeId/collab` → `{ yjsStateId, role }` (Phase 1 contract). |
| **B2** Autosave PUT 409s against active-session lock | On the collab path the editor mounts **no** `useAutoSave`; persistence is the server's (FR-006). |
| **B3** Double initial content / desync | Collab editor mounts with an **empty** doc; `yCollab` populates it from Yjs sync (FR-004). REST content fetch removed from the editing path. |
| **H1** ETag polling false-positives | External-change polling not started on the collab path. |
| **H2** Drafts + `beforeunload` keepalive PUT | localStorage drafts + keepalive PUT disabled on the collab path. |
| **H3** No client role/connection signal | Role from the new endpoint; connection state from `HocuspocusProvider` status events → read-only + status UI (FR-012/013/014). |
| **M1** No collab WS config/auth on web | `NEXT_PUBLIC_COLLAB_URL`; cookie auto-sent on WS handshake (no token). |
| **M2** Keep `GET /content` | Retained for binary assets and the offline read-only fallback; only removed from the live editing path. |
| **M3** Preview sync must survive | Preview keeps reading the CodeMirror `updateListener`, which still fires on Yjs-applied changes; verified by test. |
| **SEC1** Public WS lacks rate limiting | In-app per-user connection/room caps + connect-rate in `onConnect` (Phase 7, T053–T055). |
| **SEC2** No WS Origin check (CSWSH) | `Origin` allowlist on handshake + cookie `SameSite` lock (T056–T057). |
| **SEC3** No WS message size limit | Max-payload guard on inbound Yjs messages (T058–T059). |
| **SEC4** Authz denials not audited | Denial logging with actor/resource/reason on collab paths (T060–T061). |
| **SEC5** Public WS defaults to `ws://` | `wss://` documented as a production requirement (T063). |
| **CFG1** Security config keys missing | New `ASCIIDOCOLLAB_COLLAB_*` keys in `collab-config.ts` + `.env.example` (T053). |
| **CFG2** E2E lacks collab service | Start `apps/collab` via `pnpm` in CI/e2e (infra-only in compose), not docker-compose (T068). |
| **DOC1/DOC2** README/CONTRIBUTING stale | Updated in T071 (env table, feature status, run steps, dev/test processes). |

## Project Structure

### Documentation (this feature)

```text
specs/020-realtime-co-editing/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── get-collab-document-info.md
│   └── collab-awareness-user.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
packages/shared/src/dtos/
└── collab.dto.ts                         # + CollabDocumentInfo (extends existing role types)

packages/domain/src/use-cases/content/
└── get-document-collab-info.ts           # NEW use case: actor+project+fileNode → {yjsStateId, role}
packages/domain/tests/use-cases/content/
└── get-document-collab-info.test.ts      # NEW (in-memory fakes)

apps/api/src/routes/projects/
└── file-content.ts                       # + GET …/collab route (delegates to use case)
apps/api/tests/routes/
└── file-collab-info.test.ts              # NEW integration test

apps/web/src/lib/
├── editor-config.ts                      # + NEXT_PUBLIC_COLLAB_URL, presence colour palette, sync/offline timeouts
├── api/collab.ts                         # NEW client: getCollabDocumentInfo()
└── collab/color-for-user.ts              # NEW deterministic per-user colour (research D9)
apps/web/src/hooks/
├── use-collab-document.ts                # NEW: provider+doc lifecycle, sync/connection state
├── use-file-selection.ts                 # branch: skip content GET on collab path
└── use-auto-save.ts                      # not mounted on collab path (no change to legacy behaviour)
apps/web/src/components/editor/
├── asciidoc-editor.tsx                   # branch collab vs legacy; readOnly wiring
├── collab-presence-bar.tsx               # NEW: participant avatars/count (US2)
├── editor-banners.tsx                    # + connection-state / read-only / offline banners
└── editor-collab-extensions.ts           # NEW: yCollab + Y.UndoManager + keymap assembly
apps/web/src/app/(dashboard)/dashboard/projects/[id]/
└── project-editor-layout.tsx             # pass collab info; choose mode

apps/web/e2e/                             # the 5 deferred Playwright specs (sequenced by /speckit-tasks)
├── collab-editing.spec.ts
├── collab-awareness.spec.ts
├── collab-observer.spec.ts
├── collab-late-join.spec.ts
└── collab-undo.spec.ts

# Phase 7 — Security & Ops Hardening (server-side; WS is browser-facing)
apps/collab/src/
├── config/collab-config.ts               # + ALLOWED_ORIGINS, MAX_PAYLOAD_BYTES, MAX_CONNECTIONS/ROOMS_PER_USER, CONNECT_RATE
├── extensions/connection-limit.ts        # NEW: per-user connection/room + connect-rate caps (onConnect)
├── extensions/auth-hook.ts               # + Origin allowlist check + authorization-denial logging
└── server.ts                             # + max-payload guard in Server.configure
apps/api/src/                             # session-cookie SameSite lock (SEC2)

# Config & docs
.env.example                              # + NEXT_PUBLIC_COLLAB_URL + ASCIIDOCOLLAB_COLLAB_* security keys
.github/workflows/ci.yml                  # start apps/collab via pnpm in e2e job (not docker-compose)
scripts/e2e-local.sh                      # start apps/collab for local e2e
README.md                                 # env table, feature status, run steps
CONTRIBUTING.md                           # dev/test process list (start apps/collab)
```

**Structure Decision**: Web-application monorepo. The only backend change is one additive read endpoint + its domain use case (no new ports, no migration). The substantive work is in `apps/web` (collab editing path, presence UI, undo, read-only/offline) layered onto the existing editor without disturbing the legacy REST path for non-collaborative/binary files.

## Phase 0 — Research

See [research.md](./research.md). All technical unknowns are resolved there (no `NEEDS CLARIFICATION` remain): Yjs client stack & versioning, room naming & auth, empty-init binding, collab-vs-legacy mode selection, read-only enforcement, awareness identity & deterministic colour, collaborative undo scoping, teardown/reconnection, and the no-migration confirmation.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — reused persistent entities + new DTO + client-side view models.
- [contracts/get-collab-document-info.md](./contracts/get-collab-document-info.md) — the new REST endpoint.
- [contracts/collab-awareness-user.md](./contracts/collab-awareness-user.md) — the awareness `user` field shape published by each client.
- [quickstart.md](./quickstart.md) — run both servers and verify two-user co-editing.

## Phase 2 — Task generation (handled by `/speckit-tasks`)

Tasks will be generated per user story (US1 P1 → US4 P3), test-first, with the 5 E2E specs sequenced last (they require both servers running). Not produced by this command.

## Phase 8 — Verification status notes (T064 / T065)

These two Polish tasks are **partially** complete; the remainder is documented here per T065.

- **T065 (no-data-loss on shutdown)**: the room-teardown **write-back** is verified end-to-end by
  `e2e/collab-persistence-handoff.spec.ts` (T026) — after collaborative edits and room teardown,
  `GET /content` reflects the edits and the editor issues **no** `PUT /content` of its own. The
  process-level **SIGTERM shutdown flush** is the existing spec-018 guarantee (`apps/collab`
  `shutdown()` → `server.destroy()` + `closeAll()`), covered by spec-018 tests. A dedicated
  SIGTERM → restart → reopen regression was **not** added in this feature. No persistence gap found.
- **T064 (performance)**: the latency success criteria are validated by the green E2E —
  `collab-editing` asserts a remote edit is visible to the other tab within ~1 s (SC-001) and
  `collab-late-join` asserts a late joiner sees full content within ~2 s (SC-002). Awareness
  throttling is **not applicable**: `y-codemirror.next` manages cursor/selection awareness with no
  throttle hook, and the application-supplied awareness `user` field is set only on connect / profile
  change (not per-keystroke), so it is not a presence-spam source — the speculative
  `AWARENESS_THROTTLE_MS` constant was removed rather than left as misleading dead code. **Not done**:
  a dedicated large-document smoke test (additive coverage; not a correctness gap).

## Delete guard relaxed (verified by the live e2e)

Spec 018 blocked deleting a file/folder while a `CollaborationSession` was active
(`ActiveCollaborationSessionError` → 409). Once every opened text file holds a session (020),
that guard made any file the user had merely selected/opened impossible to delete — a core
file-tree UX regression surfaced by the real e2e. The DELETE-time guard was therefore removed
from `DeleteFileUseCase` (the `CollaborationSession` row is cleaned up by the cascade on the
deleted `Document`). The **PUT** `/content` guard is unchanged and correct: external writes while
a room is active are still rejected (the collab server owns persistence). A separate latent 018
bug was also fixed: `onDisconnect` relied on `context.documentId`, which Hocuspocus does not
preserve across hooks, so collaboration sessions never closed — `apps/collab/src/server.ts` now
resolves the document by `yjsStateId` on disconnect so rooms close reliably.

## Code-review follow-up (fixes applied)

A high-effort recall review surfaced 10 findings. Fixed with TDD for the business-logic ones:
- **CONFIRMED bugs fixed:** (1) `ConnectionLimitExtension` never released per-user slots on disconnect (context not preserved across hooks) → now keyed on `socketId`, locking-out impossible; (2) `PersistenceExtension.onStoreDocument` re-created an orphaned Yjs blob for a file deleted mid-session → now resolves the document first and skips all writes when it's gone; (3) observers were not enforced server-side → `auth-hook` now sets `connection.readOnly` for observers (Hocuspocus rejects their inbound updates).
- **PLAUSIBLE fixed:** (4) a non-404 `/collab` failure silently opened the editable legacy editor (split-brain) → `use-file-selection` now surfaces an error; (5) the offline read-only fallback re-enabled REST autosave → `AsciiDocEditor` disables it on the whole collab path (binding OR connection state); (6) the post-sync cursor restore raced doc population → moved into `useEditorMount`'s update listener (fires on first content arrival, clamped).
- **Cleanup:** (7) clarified the best-effort `context.documentId` fast path; (10) extracted a shared `logAuthorizationDenial` helper.

### Known limitations (not fixed — would need larger changes; tracked as follow-ups)
- **Mid-session role demotion without a reconnect** (#8): the role is re-checked on `reconnecting→synced`, and `auth-hook` now enforces `readOnly` at every (re)connect, but a user demoted while *continuously* connected keeps their editor connection's `readOnly=false` until they reconnect. A complete fix needs the collab server to PUSH role changes to connected clients (new mechanism).
- **`GET /collab` serial round-trip on file open** (#9): the collab probe is awaited before the content fetch on every file open, adding one RTT for non-collab files too. Removing it cleanly needs the API to return collab info on (or as a header of) the `/content` response, or a parallel-then-discard fetch.

## Code-review follow-up — round 2 (fixes applied)

A second high-effort review (after the round-1 fixes) surfaced further findings, concentrated in
`ConnectionLimitExtension`'s in-memory accounting. Fixed with TDD:
- **Orphan state on a denied first connection** + **denied attempts consuming rate budget**
  (`connection-limit.ts`): `onConnect` now evaluates all caps WITHOUT mutating stored state and
  commits (`users.set` / `socketUsers.set` / rate timestamp) only on accept — a rejected connection
  leaves no entry and consumes no rate budget.
- **Counted-slot leak → user lockout when a LATER hook rejects** (`server.ts onConnect`): this hook
  runs after `ConnectionLimitExtension` (verified via Hocuspocus's priority-sorted extension order,
  config pushed last) and Hocuspocus fires no `onDisconnect` for a connection rejected during
  `onConnect`. It now **fails open** — a `Document not found` or `onRoomOpen` failure logs and lets
  the connection proceed untracked instead of throwing (which would leak the slot and, on a
  repeatable DB outage, lock the user out). Session tracking is best-effort; the watchdog reclaims
  untracked rooms.
- **Observer write-skip in the wrong layer** (`persistence.ts onStoreDocument`): removed the
  `context.role === 'observer'` gate. `onStoreDocument` is a document-level hook whose `context`
  does not reliably identify the writing connection, so it could silently drop a legitimate
  editor's edits in a mixed room. Observer writes are now enforced solely at the transport layer
  (`auth-hook` sets `connection.readOnly`), which is the correct single source.

### Known limitations (accepted trade-offs / larger follow-ups, not bugs)
- **Two independent work-arounds for "Hocuspocus drops onConnect context on disconnect"**
  (`server.ts` documentId lookup + `connection-limit.ts` socketId map). After the fail-open change
  `server.ts` no longer depends on the preserved context; a future shared per-socket context shim
  would let a third hook avoid repeating the pattern.
- **`socketUsers` assumes one socketId per room-connection** — true for the current client (one
  `HocuspocusProvider` = one socket = one room). A future multiplexed (shared-socket, multi-room)
  client would need per-room accounting.
- **Ghost room after mid-session delete** still runs until the orphaned-room watchdog reclaims it;
  a prompt force-close would need an internal collab endpoint the API delete route calls.
- **`logAuthorizationDenial`** standardizes the 2 API denial sites; the 2 collab-extension sites
  keep their local `deny()` helpers (crossing the api→collab package boundary for one log line is
  not worth the coupling).
- **Collab cursor restore** fires on the first populated `docChanged`; for a very large document
  that syncs in multiple chunks the first chunk could clamp the line early (cosmetic, never data
  loss). The common single-transaction sync — covered by the e2e — restores correctly.

## Code-review follow-up — round 3 (fixes applied)

A third review found that round-2's blanket fail-open in `server.ts onConnect` **violated FR-011**:
a live room with no `CollaborationSession` row lets a concurrent REST `PUT /content` bypass the
active-session edit lock. Corrected:
- **`server.ts onConnect` now fails open ONLY for a confirmed document-not-found** (the file is
  gone — nothing to protect, and the connection still avoids leaking the counted slot). When the
  **document exists but `onRoomOpen` fails**, it **rejects** the connection again, preserving the
  FR-011 lock. The accepted cost is the original, restart-recoverable risk that a repeated DB-outage
  failure inflates a user's ConnectionLimit count (documented below).
- Removed the dead `context` fields from `persistence.ts`'s `LoadPayload`/`StorePayload` interfaces
  (the observer-role gate that read them was removed in round 2).

### Known limitations — ConnectionLimitExtension is a best-effort in-memory ledger
The per-user connection/room/rate caps are tracked in process memory and reconciled only by
`onDisconnect`. The count can drift **upward** (never down) and is only fully repaired by a restart
in these cases, none of which the current web client triggers:
- **Abnormal socket loss** (network drop, LB idle-reap, client `kill -9`) where Hocuspocus fires no
  `onClose`/`onDisconnect` → the user's slot and the `socketUsers` entry leak.
- **A connection rejected by a hook ordered AFTER ConnectionLimit** (e.g. `server.onConnect`
  rejecting on `onRoomOpen` failure during a DB outage) → no `onDisconnect`, slot leaks.
- **A shared-socket multiplexed client** (one `HocuspocusProviderWebsocket` across multiple
  documents) → `socketUsers` keyed by socketId collides; later per-room disconnects can't resolve
  the user. The current client uses one socket per room, so this is latent.

The robust fix (a focused follow-up) is to stop maintaining a parallel counter and instead
**reconcile against Hocuspocus's authoritative connection registry** (`payload.instance.documents`
→ live connections) on each `onConnect`, pruning slots whose socket is no longer live — making the
caps self-healing. Related: the rate limiter now counts only ACCEPTED connects, so it does not bound
attempts that are already cap-denied (those still pay an auth round-trip); and `BroadcastStateless`
is not `readOnly`-gated (harmless today — the app registers no `onStateless` handler).

## Code-review follow-up — round 4 (fixes applied)

A fourth review showed round-3's document-existence SPLIT in `server.ts onConnect` (fail-open on
not-found, reject on onRoomOpen-failure) was the wrong altitude: the fail-open branch is nearly
unreachable (the auth hook already verified the document exists milliseconds earlier), it
over-claimed to "avoid the leak" (a DB-outage lookup *throw* still rejects+leaks), and it introduced
an untracked-connection-in-a-room class of bugs (onDisconnect count mismatch; a transient-null
FR-011 micro-gap).
- **`server.ts onConnect` now REJECTS uniformly on any failure** (document-not-found OR onRoomOpen
  failure). FR-011 is always preserved (no live room ever exists without its session row), behavior
  is consistent, and there are no untracked rooms to mis-count. The ConnectionLimit slot leak on a
  rejected connection is the documented, restart-recoverable ledger cost — NOT specially avoided.

### Note — session rows can also orphan on abnormal connection death
If a socket dies AFTER a successful `onConnect` (session row written) but before/without a clean
`onDisconnect`, the `CollaborationSession` row stays open until restart (`closeAll`), leaving the
file 409/undeletable. This is the same root issue as the ConnectionLimit ledger drift, and the same
reconciliation follow-up resolves both: a periodic sweep that closes session rows / releases slots
whose room has no live Hocuspocus connection (`payload.instance.documents`).

## Code-review follow-up — round 5 (SOLID / clean-architecture conformance)

An architecture review against the project constitution found the feature largely compliant
(domain use cases are dependency-clean with typed Results; composition root wires concretions; no
service locators). Fixes applied:
- **(P0 violation) Business logic in a route handler + duplicated rule** — `internal/collab-auth.ts`
  inlined the whole collab-authorization pipeline and re-implemented the viewer→observer rule that
  `GetDocumentCollabInfoUseCase` already owned. Extracted `AuthorizeCollabConnectionUseCase`
  (resolves by `yjsStateId`, returns a typed `CollabConnectionDeniedError` carrying the denial
  reason) and a shared `toCollabRole` helper used by BOTH paths; the route now only parses/validates
  the room name and delegates. (TDD: `authorize-collab-connection.test.ts`.)
- **DIP/ISP in `server.ts`** — `createCollabServer` now accepts an injected `logger` (config object,
  shared with the composition root's redaction config) instead of a module singleton, and depends on
  a narrow `DocumentByYjsStateLookup = Pick<DocumentRepository, 'findByYjsStateId'>` instead of the
  fat repository.
- **Type duplication** — `CollabBinding.role` uses the shared `CollabAuthRole` instead of an inline
  `'editor' | 'observer'` literal.
- **DRY (collab audit)** — `auth-hook` and `connection-limit` denials now go through one
  `logCollabConnectionDenial` helper (`apps/collab/src/audit-log-denial.ts`), `actor` optional.
- **Clean code** — `parseRoomName` rejects a missing `/` explicitly (no fabricated ids); the FR-005
  cursor clamp is a single `clampToValidLine` helper instead of a duplicated inline formula.

### Assessed but intentionally not changed (rationale)
- **SRP of `project-editor-layout.tsx`** — it does carry the collab-session machine atop the panel
  layout; extracting `useEditorSession` / `useLiveCollabRole` is a worthwhile maintainability refactor
  but a large change to a working, tested 450-line component — better done as a focused follow-up than
  at the tail of the review series.
- **Distinct "denied" connection state** in `use-collab-document` (a WS 1008/1011 currently reads as
  "offline") — a real UX improvement, but it requires plumbing the close code through the
  `CollabProvider` abstraction + banner + sticky-state handling across ~4 files; deferred as a
  scoped follow-up.
- **Typed `Result` error channel for `SessionCallbacks` / the WS-hook `throw`** — the collab hooks are
  delivery-layer code where throwing-to-reject is the Hocuspocus contract; the generic `Error` here is
  a framework idiom, and the domain/application layers already use typed errors. Low practical value.
- **Splitting `ConnectionLimitExtension`'s three caps** — the class is cohesive as a single
  "per-user connection-admission policy"; the rate window is a two-line filter, so a dedicated
  `RateWindow` abstraction would be over-decomposition.
