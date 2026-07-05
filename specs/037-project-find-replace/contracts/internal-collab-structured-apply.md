# Contract: Internal Collab Structured Apply

**Endpoint**: `POST /internal/collab/apply-structured-replacement`
**Server**: `apps/collab/src/internal-edit-server.ts` (internal edit server; loopback-bound, shared-secret / mTLS, body-size capped — same protections as the existing `/internal/collab/apply-edits`)
**Core**: `applyStructuredReplacementToDocument(hocuspocus, request)` in `apps/collab/src/apply-edits.ts`
**Caller**: `HttpStructuredCollaborativeEditor` (`packages/infrastructure/src/services/http-structured-collaborative-editor.ts`)

## Why this exists (not the existing `/apply-edits`)

`/apply-edits` applies **occurrence-global literal** find→replace — correct for symbol rename, wrong for regex capture groups and per-match exclusion. This endpoint re-matches the query against live content and rewrites only the confirmed spans.

## Request body

```
{
  projectId: string,          // UUID-validated
  yjsStateId: string,         // UUID-validated
  query: { query, mode, caseSensitive, wholeWord },
  replacement: string,
  selections: [ { ordinal: number, expectedText: string } ]
}
```

Body cap (reuse existing 4 MB limit); optional `x-collab-internal-secret` (constant-time compare) and/or mTLS as configured.

## Behavior

1. `roomName = ${projectId}/${yjsStateId}`; `connection = await hocuspocus.openDirectConnection(roomName)`.
   - Attaches to an **open room** (live editors see it) or loads a **dormant** one from authoritative Yjs state (never the plain-text file).
2. `await connection.transact(doc => { ... })`:
   - Read the current `doc.getText('codemirror')` string.
   - Recompute match spans with the shared `computeMatches` (RE2 in regex mode — same engine adapter as the API).
   - For each `{ordinal, expectedText}` in `selections`, take the span at that ordinal; if its text ≠ `expectedText`, **skip** (stale — FR-017).
   - Build right-to-left positional edits (`substitute` for the replacement/capture template) and apply via `ytext.delete`/`ytext.insert` — offsets stay valid within the transaction.
3. `await connection.disconnect()` → forces writeback (Yjs blob + plain text), unloads if idle.
4. Return `{ applied: number }` (occurrences replaced; `0` ⇒ live diverged).

## Guarantees

- One Yjs transaction per document → merges with concurrent edits (FR-011); atomic per file.
- Re-matching inside the transaction makes positional editing safe despite concurrent scan→apply drift.
- No plain-text write for documents with live/Yjs state; the plain-text projection is updated only via the normal writeback.
