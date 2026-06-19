# Contract: Per-File, Per-User Cursor Memory

Extends `apps/web/src/hooks/use-last-selection.ts` (existing per-user `localStorage` store that already persists a single file's cursor `line`). Cursor memory is a personal preference (Constitution VII) — per-user, per-browser, never shared content.

## Storage

- Key: `asciidocollab:file-cursors:{userId}:{projectId}` (scoping mirrors `lastSelectionKey`).
- Value: `Record<nodeId, { line: number }>` — one entry **per file** (FR-022).
- Reads are validated/narrowed like `toLastSelection` (never throws; drops invalid entries).

## API

```ts
function rememberCursorLine(userId: string, projectId: string, nodeId: string, line: number): void;
function readCursorLine(userId: string, projectId: string, nodeId: string): number | undefined;
function pruneCursor(userId: string, projectId: string, nodeId: string): void; // deleted file
```

## Behavior (tested — unit + multi-file e2e)

- Opening a file with a remembered line places the cursor there and scrolls it into view (FR-023).
- Positions are isolated per file and per user (FR-024) — two users on one browser profile use distinct keys; two files use distinct map entries.
- A remembered line beyond current length clamps to the nearest valid line (FR-025).
- No remembered line ⇒ open at top (FR-026).
- Persists across sessions on the same browser (FR-027). Cross-device is out of scope (research R8).
- A deleted file's entry is ignored and pruned without error (edge case).

## Integration

- Save on cursor settle / file switch (debounced), reusing the editor's existing selection-change wiring.
- Restore on file open, after the document loads, reusing the existing `selectFile` path (the `LastSelection.line` shape already aligns).
- The existing single "last selection" behavior (restore the last-opened file on project open) is preserved; this contract adds the per-file map alongside it.
