# Contract: Last-Selection Storage (`useLastSelection`)

A client-side persistence seam for the per-project last selection. This is the project's "interface" for this feature (a web app UI/state contract, not an HTTP API). Implemented in `apps/web/src/hooks/use-last-selection.ts`.

## Storage key

```
asciidocollab:last-selection:${userId}:${projectId}
```

One entry per (user, project). Scoping by `userId` prevents one account from inheriting another's selection on a shared browser profile (FR-011). The key MUST be built by a named helper (no inline string literals), following `use-editor-preferences.ts`.

## Persisted value (JSON)

```ts
interface LastSelection {
  nodeId: string;
  nodeName: string;
  nodeType: 'file' | 'folder';
  path: string;
  line?: number; // 1-based; AsciiDoc only
}
```

## Hook surface

```ts
function useLastSelection(userId: string, projectId: string): {
  /** Read + validate the stored selection once (null if none/invalid). */
  readLastSelection: () => LastSelection | null;
  /** Persist the selected file (clears any previous line). No-op for folders. */
  rememberFile: (file: { nodeId: string; nodeName: string; nodeType: 'file' | 'folder'; path: string }) => void;
  /** Merge the cursor line into the current entry (caller debounces). */
  rememberLine: (line: number) => void;
  /** Delete the entry (used on stale/not-found). */
  clearLastSelection: () => void;
};
```

## Behavioral contract

| # | Given | When | Then |
|---|-------|------|------|
| C1 | No entry for the project | `readLastSelection()` | returns `null` |
| C2 | A valid entry exists | `readLastSelection()` | returns the parsed `LastSelection` |
| C3 | Stored JSON is malformed / wrong-typed | `readLastSelection()` | returns `null` (no throw) |
| C4 | Stored `line` is not a finite `>= 1` number | `readLastSelection()` | returns the entry with `line` omitted |
| C5 | A file is selected | `rememberFile(file)` | entry written; any prior `line` dropped |
| C6 | A folder is passed | `rememberFile(folder)` | no write occurs |
| C7 | An entry exists | `rememberLine(n)` | `line` merged into the existing entry |
| C8 | No entry exists yet | `rememberLine(n)` | no entry is fabricated (line without a file is meaningless) |
| C9 | An entry exists | `clearLastSelection()` | key removed |
| C10 | `localStorage` throws (disabled/quota) | any operation | operation is a safe no-op; reads return `null` |
| C11 | Two different `projectId`s (same user) | writes to each | entries are independent (FR-003) |
| C12 | Two different `userId`s (same project) | writes to each | entries are independent; user A's `readLastSelection()` never returns user B's value (FR-011) |

## Requirements traceability

- FR-001, FR-003 → C5, C11
- FR-011 → C12 (user-scoped key)
- FR-004, FR-008 → C5, C7
- FR-006 → C5 (no `line` written for non-AsciiDoc; enforced by the caller passing `rememberLine` only for AsciiDoc)
- FR-007 → `localStorage` medium (survives reload/restart)
- FR-009 → C9 (clear on not-found)
- FR-010 → C3, C10 (never throws/blocks)
