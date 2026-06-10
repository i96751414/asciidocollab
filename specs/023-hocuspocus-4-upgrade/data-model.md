# Phase 1 Data Model: Hocuspocus 4 Upgrade

This is a dependency upgrade with **strict behavior parity**. It introduces **no new entities, no schema changes, and no data migration**.

## Existing entities (unchanged)

- **Collaborative document state (Yjs state)** — the mergeable binary representation of a file's content used for real-time co-editing, persisted by the project's own `PersistenceExtension` via the filesystem Yjs-state store. Encoding is produced by `yjs`, whose version does not change, so the binary format is identical before and after the upgrade.
- **Document** (Prisma) — links a file node to its `yjsStateId`. Unchanged.
- **CollaborationSession** (Prisma) — the active-session row that backs the FR-011 edit lock, created in the server's `onConnect` and removed in `onDisconnect`. Its lifecycle and shape are unchanged; only the Hocuspocus hook payload *types* feeding those hooks change (web `Headers`), not the data written.

## Validation / invariants (unchanged, must hold post-upgrade)

- A live room implies exactly one open `CollaborationSession` row (edit lock invariant). Preserved.
- Closing the last connection removes the session row (re-checked against `getConnectionsCount()`), so the file becomes deletable/REST-writable again. Preserved.
- Pre-upgrade Yjs state loads and remains editable post-upgrade (FR-007 / SC-003).

## State transitions (unchanged)

`onConnect` (auth → session open) → live editing/awareness → `onDisconnect` (last client → session close + write-back). The transition logic is identical; only header access inside the auth step changes form.

**Conclusion**: nothing to model. The integrity concern is *continuity*, covered by the contract and quickstart verification rather than by new structures.
