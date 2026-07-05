# Quickstart / Validation: Collaborative Consistency of Attribute/Symbol-Derived State

Two-client scenarios that validate the spec's success criteria. Run against an isolated stack with the **collab** server (per [[quality_gates]] `scripts/e2e-stack-persist.sh`); use `--workers` ≤3 (single collab server). "Client A" has a document open; "Client B" edits a related file. No manual refresh or save unless stated.

## Preconditions

- A project with a main file that `include::`s a child; the child references `{productName}` and has a heading whose auto-id depends on an inherited `:idprefix:`.
- Client A opens the **child**; Client B opens a **related** file (parent/sibling).

## Scenarios → Success Criteria

| # | Steps | Expected | Verifies |
|---|---|---|---|
| 1 | B changes parent `:productName:` live (no save) | A's **preview** converges to the new value after edits settle | SC-001, FR-001/003/005/006 |
| 2 | B adds/removes a definition for an attribute A references | A's **editor highlighting** flips undefined↔known; no stale state after settle | SC-002, FR-002/006 |
| 3 | B changes inherited `:idprefix:` / edits related headings | A's **heading IDs + outline** match the assembled document | SC-003, FR-007 |
| 4 | **Outline panel closed** in A; repeat #1/#3 | A updates identically to outline-open | SC-009, FR-016 |
| 5 | B edits **and saves** a related file, then disconnects (no live session) | A refreshes to the saved content after it settles (no reconnect, no structural event) | SC-010, FR-017, US6 |
| 6 | While A shows a rename suggestion, B adds a reference / a colliding definition live | A's suggestion count/collision updates before apply | SC-004, FR-010 |
| 7 | A applies the rename | Every live occurrence rewritten (live + persisted), single-step undo | SC-005, FR-011 |
| 8 | B's session on a related file ends | A reverts to persisted content with no intermediate stale flash | SC-008, FR-003, US7 |
| 9 | Rapid B keystrokes on a related file | A performs bounded recompute, converges on final value | FR-012/020 |
| 10 | Kill/restore A's SSE connection mid-edit | On reconnect A clears cache + rebuilds; recovers with non-live indicator meanwhile | FR-021 |
| 11 | Peers rapidly open/close sessions on related files | No thrash, no teardown races; A's dependency set unchanged | FR-024, SC-007 |

## Non-regression gates (must stay green)

- **Feature-032 two-client outline E2E specs** — the outline still updates live after the observer→SSE transport swap (regression guard for D5).
- **Feature-033 rename E2E specs** — rename apply/undo unchanged.
- Local typing latency in A shows **no perceptible regression** while B edits a related file (SC-011 — qualitative check; per Constitution Principle II no automated latency benchmark is added because the spec sets no numeric target).

## Connection-count check (SC-007)

With A open on a document reaching many related files, confirm A holds **one** project SSE connection (shared across tabs via the SharedWorker) and **zero** per-related-file Hocuspocus observer sockets — contrast with the pre-feature behavior.
