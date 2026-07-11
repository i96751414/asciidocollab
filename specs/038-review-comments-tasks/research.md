# Phase 0 Research: Review Comments and Tasks

All decisions below are resolved — no open `NEEDS CLARIFICATION`.

## R1. Anchoring strategy (edit-resilient, with fallbacks)

**Decision**: Three-tier anchor. Primary = encoded Yjs `RelativePosition` pair (start/end) over the shared `Y.Text('codemirror')`, stored on the `ReviewComment` row. Durability fallback = text-quote `{prefixHash?, prefix, exact, suffix}` + 1-based line hint. Structural fallback = enclosing section symbol id from `ProjectSymbolIndex`. On load, resolve relpos against the live Y.Text; if unresolvable, re-anchor by quote; if the quote is gone, attach to the section; else mark `DETACHED`.

**Rationale**: The project already runs Yjs; a `RelativePosition` auto-follows concurrent edits and resolves identically on every converged client — no hand-rolled operational transform (Principle IV). It can be computed from a **read-only** local Y.Text and stored externally, so a viewer-authored path is possible later without writing to the room. The quote selector is the proven W3C Web Annotation degradation; the section fallback exploits infrastructure that already maps ranges → sections. Nothing is lost — `DETACHED` items go to a tray (FR-015).

**Alternatives considered**:
- *Char offset only* — rejected: drifts on any upstream edit (the GitHub "outdated" failure).
- *Store anchors inside the Yjs doc* — rejected: a VIEWER's WS connection is read-only, and cross-document task queries would require scanning every room; also couples durable data to the CRDT blob.
- *Inline markup in the `.adoc`* — rejected: pollutes source/exports, mutates history, needs write access to comment (violates FR-017).

## R2. System of record & write path

**Decision**: PostgreSQL is authoritative; all writes go through the Fastify REST API. The Yjs room is used only to *resolve* stored anchors client-side and (optionally) to signal "items changed".

**Rationale**: Tasks need cross-document relational queries ("open tasks assigned to me") — a CRDT can't serve that. The REST path lets authorization, validation, tenant isolation, and `AuditLog` be enforced server-side in use cases (Security Constitution). Matches the existing metadata-in-Postgres convention (`Document`, `CollaborationSession`).

**Alternatives considered**: Yjs-only store (no cross-doc queries, weak server authz); dual-write to both (needless complexity, reconciliation risk).

## R3. Real-time propagation to other open clients

**Decision**: After a successful REST mutation, notify other clients viewing the same document to refetch (or apply the delta). Reuse the existing collaboration transport — a lightweight presence/awareness signal keyed by document, **not** a new shared Yjs type — falling back to short-interval refetch if needed. Anchor *resolution* is always client-side against the live Y.Text.

**Rationale**: Meets SC-001 (< 2 s visibility) without inventing a second realtime channel or storing comment data in the CRDT. Keeps the durable record in Postgres and the fast-path notification cheap.

**Alternatives considered**: SSE/WebSocket per-document comment stream (new infra); polling only (higher latency, wasteful); storing comments in Yjs (rejected in R1/R2).

## R4. Untrusted-input handling for bodies & reactions (Constitution IX — NON-NEGOTIABLE)

**Decision**: Comment/reply bodies are treated as untrusted. Validate at the API boundary (Fastify schema: max length, required fields) and **sanitize through the project's existing sanitizer** before rendering in the panel; render as plain text + emoji (no user HTML). Emoji reactions are validated against a unicode-emoji allowlist/validator at the boundary; a reaction stores only a normalized emoji key + user + item. Any quote-matching uses linear-time string search (no user-controlled regex).

**Rationale**: The panel renders user-authored content inside the app shell; unsanitized bodies are an XSS vector. The constitution forbids widening or forking the sanitizer, so bodies reuse it as-is. Emoji allowlisting prevents arbitrary payloads in the "emoji" field.

**Alternatives considered**: Markdown/HTML comment bodies (rejected for v1 — expands the sanitization surface); free-form reaction strings (rejected — injection surface).

## R5. Permissions & tenant isolation

**Decision**: Editors-only writes enforced **in the use case** (RBAC per Security Constitution), re-checked at the route via the existing project-membership guard. Every repository query is filtered by `projectId` and the caller's membership; project-wide bulk delete additionally requires OWNER. Authorization denials are audited.

**Rationale**: Defense in depth — the domain is the trust boundary; the repository enforces multi-tenant isolation so a bug in a controller can't leak cross-project data.

**Alternatives considered**: Route-only checks (rejected — business rule leaks out of the domain, weaker under refactor).

## R6. Deleted-user handling

**Decision**: `authorId`/`assigneeId`/`resolvedById` reference `User` with **ON DELETE SET NULL** (nullable). The UI renders a null author as "Deleted user"; a task whose `assigneeId` became null shows as unassigned. No cascade delete of review content.

**Rationale**: Preserves the review record (FR-024, SC-009) and avoids orphaned foreign keys. Set-null is the least-surprising referential policy for authored artifacts.

**Alternatives considered**: Cascade-delete the user's items (loses history, orphans threads); a synthetic "ghost user" row (extra machinery vs a nullable FK + UI label).

## R7. Reaction storage & aggregation

**Decision**: Separate `ReviewReaction` row `(reviewCommentId, userId, emoji)` with a unique constraint on the triple (idempotent toggle). Aggregation (per-emoji counts + reactors) is a grouped read; toggling deletes/inserts the row.

**Rationale**: Normalized, dedup-safe (the unique key makes double-react a no-op → toggle), and cheap to aggregate. Keeps the `ReviewComment` row lean.

**Alternatives considered**: JSON blob of reactions on the comment row (harder to enforce one-per-user, race-prone under concurrent toggles).

## R8. Panel visibility as a per-user preference (Principle VII)

**Decision**: Show/hide state persists on the existing per-user `EditorPreferences` (or equivalent user-scoped store), never on shared content. Navigation state (current item) is ephemeral client state.

**Rationale**: Panel visibility is a personal view preference; storing it on shared content would violate Principle VII and affect collaborators.

**Alternatives considered**: Local-storage only (loses cross-device continuity — acceptable but weaker); project-scoped setting (wrong — it's per-user).

## R9. Bulk delete semantics

**Decision**: `BulkDeleteForDocument` (EDITOR/OWNER) and `BulkDeleteForProject` (OWNER only) are distinct use cases, each behind an explicit client confirmation and each writing a single summarizing `AuditLog` entry (count + scope). Idempotent: a second concurrent call deletes nothing more.

**Rationale**: Bounds blast radius by role (per clarification), keeps the destructive path auditable, and stays safe under concurrency.

**Alternatives considered**: One parameterized endpoint (blurs the role gate); soft-delete/trash (explicitly rejected in clarification — permanent, no trash in v1).

## R10. Design iteration in Claude Design

**Decision**: Prototype the five review surfaces (see plan "Design Iteration") in Claude Design against the synced *asciidocollab Design System*, iterate with stakeholders, and freeze layouts before the Phase-2 UI tasks.

**Rationale**: The design system is already uploaded; prototyping with the real components yields on-brand, buildable screens and de-risks the UI before implementation. Satisfies Principle V (token-driven, light+dark).

**Alternatives considered**: Design-in-code directly (slower iteration, weaker stakeholder review loop).
