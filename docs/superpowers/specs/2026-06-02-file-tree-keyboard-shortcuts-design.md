# Design: File Tree Keyboard Shortcuts

**Date**: 2026-06-02
**Feature branch**: `011-project-file-storage`
**Phase**: Phase 9 (addition to existing 011 plan)

## Summary

Add per-user configurable keyboard shortcuts for four file tree actions — Rename, Delete, New File, New Folder — scoped to fire only when the file tree has focus. Bindings are stored per-user in a new `UserKeyBinding` DB table, served via `GET/PATCH/DELETE /users/me/keybindings`, and managed in the frontend through two focused hooks. The system is namespace-aware so future features (e.g. the document editor) can register their own actions without structural changes.

---

## Section 1: Data Model & Domain

### Prisma model

```prisma
model UserKeyBinding {
  id        String   @id @default(uuid())
  userId    String
  action    String
  keyCombo  String
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, action])
}
```

### Default binding registry

A static constant `DEFAULT_KEY_BINDINGS` in `packages/domain/src/constants/key-bindings.ts` maps every known action to its metadata:

```typescript
export const DEFAULT_KEY_BINDINGS: Record<string, KeyBindingDefinition> = {
  'file-tree:rename':     { namespace: 'file-tree', label: 'Rename',     defaultCombo: 'F2' },
  'file-tree:delete':     { namespace: 'file-tree', label: 'Delete',     defaultCombo: 'Delete' },
  'file-tree:new-file':   { namespace: 'file-tree', label: 'New File',   defaultCombo: 'Ctrl+N' },
  'file-tree:new-folder': { namespace: 'file-tree', label: 'New Folder', defaultCombo: 'Ctrl+Shift+N' },
  // future namespaces register here: 'editor:bold', 'editor:italic', ...
};
```

New features add entries to this map; no DB migration is needed for new default actions.

### Domain interfaces & use cases

**`KeyBindingRepository`** (interface in `packages/domain`):
- `findAll(userId: string): Promise<KeyBinding[]>`
- `upsert(userId: string, action: string, keyCombo: string): Promise<void>`
- `delete(userId: string, action: string): Promise<void>`

**`GetKeyBindingsUseCase(userId, namespace?)`** — loads the user's DB rows for the given namespace (or all namespaces if omitted); merges with `DEFAULT_KEY_BINDINGS` defaults for any unset actions; returns `KeyBindingDto[]` with `isDefault: boolean`.

**`UpdateKeyBindingUseCase(userId, action, keyCombo)`** — validates:
1. `action` exists in `DEFAULT_KEY_BINDINGS`
2. `keyCombo` is not in the reserved-combos blocklist (`Ctrl+W`, `Ctrl+T`, `Ctrl+R`, `F5`, `F11`, `Alt+F4`)
3. No other action in the same **namespace** already uses `keyCombo` for this user (within-namespace uniqueness; cross-namespace duplicates are permitted — different focus scopes)

On success: upserts the row. On failure: returns a typed `ValidationError` or `KeyBindingConflictError`.

**`ResetKeyBindingUseCase(userId, action)`** — deletes the DB row; subsequent reads fall back to the default.

---

## Section 2: API

All routes require an authenticated session. All operate on the calling user's bindings only — no cross-user access.

### `GET /users/me/keybindings`

Optional query param `?namespace=file-tree`. Returns all matching bindings (DB rows merged with defaults).

**Response `200`**:
```json
[
  { "action": "file-tree:rename",     "keyCombo": "F2",           "isDefault": true  },
  { "action": "file-tree:delete",     "keyCombo": "Delete",       "isDefault": true  },
  { "action": "file-tree:new-file",   "keyCombo": "Ctrl+N",       "isDefault": false },
  { "action": "file-tree:new-folder", "keyCombo": "Ctrl+Shift+N", "isDefault": true  }
]
```

### `PATCH /users/me/keybindings/:action`

**Body**: `{ "keyCombo": "string" }`

**Errors**: `400` invalid/reserved combo · `404` unknown action · `409` combo already used by another action in the same namespace.

**Response `200`**: updated `KeyBindingDto`.

### `DELETE /users/me/keybindings/:action`

Resets to default by removing the DB row.

**Response `204`**.

---

## Section 3: Frontend Hooks

### `useKeyBindings(namespace: string)`

Read-only. Fetches `GET /users/me/keybindings?namespace=<namespace>` on mount. Returns `Map<action, keyCombo>`. Lightweight — used by `useFileTreeKeyHandler` and any future feature hook that needs to read bindings for its namespace.

### `useKeyBindingSettings()`

Used exclusively by the account settings page. Fetches `GET /users/me/keybindings` directly (no namespace filter — loads all namespaces). Exposes:
- `groups: KeyBindingGroup[]` — bindings grouped by namespace, each group has a `label` and `bindings: KeyBindingDto[]`
- `updateBinding(action, keyCombo): Promise<void>` — calls `PATCH`, optimistic update with rollback on error
- `resetBinding(action): Promise<void>` — calls `DELETE`, optimistic update with rollback

### `useFileTreeKeyHandler(containerRef, selectedNodeId, bindings, callbacks)`

Attaches a `keydown` listener to `containerRef.current`. Normalises the `KeyboardEvent` to a canonical string (e.g. `"Ctrl+N"`, `"F2"`). Looks up which action maps to that combo from `bindings`. Fires the matching callback from `{ onRename, onDelete, onNewFile, onNewFolder }`. Calls `e.preventDefault()` and `e.stopPropagation()`. Fires only when `selectedNodeId` is non-null. The file tree container has `tabIndex={0}` so it can receive focus.

---

## Section 4: Account Settings UI

New **"Keyboard Shortcuts"** card on the account settings page (`apps/web/src/app/(dashboard)/dashboard/account/`), using the same shadcn `Card` pattern as existing cards.

The card renders bindings grouped by namespace. Each group has a bold section header (e.g. "File Tree") followed by a table: **Action** | **Key Binding** | **Reset**.

**Editing a binding (capture mode)**:
1. User clicks a binding cell.
2. Cell replaces its text with a bordered input showing "Press a key…".
3. Next non-modifier keypress constructs a canonical combo string and calls `updateBinding`.
4. On conflict or reserved-key error: inline error shown below the cell; previous value restored.
5. `Escape` cancels without saving.

**Reset**: ghost button per row, disabled when `isDefault: true`. Calls `resetBinding`.

Future namespaces (e.g. Editor) will appear as additional sections in the same card without any structural change.

---

## Section 5: File Tree Integration

- `FileTree` root container gets `tabIndex={0}` and a `ref` (`containerRef`).
- `FileTree` calls `useKeyBindings('file-tree')` to obtain the bindings map.
- `FileTree` passes `containerRef`, `selectedNodeId`, `bindings`, and action callbacks to `useFileTreeKeyHandler`.
- The action callbacks mirror the `FileTreeActions` context menu items — the same functions that handle rename, delete, new file, and new folder from the context menu are reused here, keeping behaviour consistent regardless of how an action is triggered.

---

## Files Touched

```
packages/domain/src/
  constants/key-bindings.ts          ← NEW: DEFAULT_KEY_BINDINGS registry
  repositories/key-binding.repository.ts ← NEW: KeyBindingRepository interface
  use-cases/get-key-bindings.ts      ← NEW
  use-cases/update-key-binding.ts    ← NEW
  use-cases/reset-key-binding.ts     ← NEW
  errors/key-binding-conflict.ts     ← NEW: KeyBindingConflictError

packages/shared/src/dtos/
  key-binding.dto.ts                 ← NEW: KeyBindingDto

packages/infrastructure/src/
  persistence/prisma-key-binding.repository.ts ← NEW

apps/api/src/routes/users/
  keybindings.ts                     ← NEW: GET/PATCH/DELETE /users/me/keybindings

apps/web/src/
  hooks/
    useKeyBindings.ts                ← NEW
    useKeyBindingSettings.ts         ← NEW
    useFileTreeKeyHandler.ts         ← NEW
  components/file-tree/
    FileTree.tsx                     ← MODIFY: add containerRef + useFileTreeKeyHandler
  app/(dashboard)/dashboard/account/
    keyboard-shortcuts-card.tsx      ← NEW
    page.tsx                         ← MODIFY: add KeyboardShortcutsCard
```

---

## Constraints & Non-Goals

- Cross-namespace combo conflicts are **permitted** (file-tree and editor can share a combo — they activate under different focus scopes).
- Within a namespace, **duplicate combos are rejected** at the API level.
- Reserved browser combos (`Ctrl+W`, `Ctrl+T`, `Ctrl+R`, `F5`, `F11`, `Alt+F4`) cannot be bound.
- No combo chord support in this phase (single key + optional modifiers only).
- The `UserKeyBinding` model cascades delete on `User` removal — no orphaned rows.
