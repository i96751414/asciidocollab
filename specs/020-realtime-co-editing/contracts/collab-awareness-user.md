# Contract: Collaboration awareness `user` field

This is the client-to-client contract carried over Yjs **awareness** (via `y-protocols/awareness`, transported by Hocuspocus). Each connected client sets its own `user` field; every other client reads it to render presence (cursors, selection highlights, name labels, avatars) and the participant bar.

## Shape

```ts
interface AwarenessUser {
  /** Stable application user id (used to derive a consistent colour and to dedupe tabs in the presence bar). */
  userId: string;
  /** Display name shown on the remote cursor label and presence bar. */
  name: string;
  /** Primary cursor/caret colour, derived deterministically from userId. */
  color: string;
  /** Lighter tint of `color` used for the selection highlight background. */
  colorLight: string;
  /** Avatar image URL; omitted when the user has no avatar (presence falls back to a coloured initial). */
  avatarUrl?: string;
}
```

The cursor position and selection range themselves are managed by `y-codemirror.next` under the awareness key it owns; this contract covers only the application-supplied `user` field.

## Rules
- **Set once on connect**, updated if the user's profile changes during the session.
- `color`/`colorLight` are computed by a pure function `colorForUser(userId)` against a fixed palette (named constant in `apps/web/src/lib/editor-config.ts`) so all clients agree on a user's colour without server coordination (research D9; satisfies 018 "assigned colour").
- A client MUST NOT render its **own** `user` entry as a remote cursor/label/avatar overlay (FR-008). y-codemirror omits the local client's remote-cursor automatically; the presence bar excludes the local awareness `clientId`.
- On disconnect, the awareness entry is removed automatically; other clients drop the overlay within the awareness timeout (FR-009).

## Test expectations (TDD)
- Two clients: client B's awareness reflects A's `{name,color,avatarUrl}`; A's own overlay is absent in A's editor.
- `colorForUser(id)` is deterministic and total over arbitrary ids (unit test).
- Same user in two tabs → two awareness entries, deduped to one identity in the presence bar by `userId`.
