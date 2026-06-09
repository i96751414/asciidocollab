# Contract: Hocuspocus Room Naming & Yjs Document Structure

## Room Name Format

```
<projectId>/<yjsStateId>
```

- `projectId`: UUID v4 string (the `Project.id`)
- `yjsStateId`: UUID v4 string (the `Document.yjsStateId`)
- Separator: `/` (single forward slash)
- Example: `550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440002`

This format is parsed by `apps/collab`'s persistence and auth extensions to resolve the project and document context.

---

## Yjs Document Structure

Each Hocuspocus room manages a single `Y.Doc`. The document MUST contain:

| Field | Type | Content |
|-------|------|---------|
| `'codemirror'` | `Y.Text` | The raw AsciiDoc file content (UTF-8) |

This field name MUST match the binding used by `y-codemirror.next` in Phase 9.

No other top-level Yjs types are defined by the collaboration server; clients may add awareness fields freely.

---

## Awareness Data Structure

Each connected client broadcasts an awareness state object. The server does not enforce a schema but the following fields are expected by the frontend (Phase 9):

```typescript
interface ClientAwareness {
  user: {
    name: string;       // display name from User.displayName
    avatarUrl: string;  // user avatar URL
    color: string;      // assigned hex colour (deterministic from userId)
  };
  cursor: {
    anchor: number;     // CodeMirror absolute position
    head: number;       // CodeMirror absolute position
  } | null;
}
```

The server broadcasts all awareness states to all clients. Each client filters out its own entry (identified by `ydoc.clientID`) before rendering overlays. This is the standard `y-codemirror.next` pattern.
