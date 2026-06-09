# Quickstart: Verify Real-time Co-editing

How to run the stack and manually verify the feature end to end.

## Prerequisites
- PostgreSQL running (see root `.env.example` / `ASCIIDOCOLLAB_DATABASE_URL`).
- `pnpm install` (adds the new web deps: `yjs`, `@hocuspocus/provider`, `y-codemirror.next`, `y-protocols`).
- Web env: set `NEXT_PUBLIC_COLLAB_URL` (default `ws://localhost:4002`).

## Run all three processes
```bash
pnpm --filter @asciidocollab/api dev       # :4000 public, :4001 internal
pnpm --filter @asciidocollab/collab dev     # :4002 WebSocket
pnpm --filter @asciidocollab/web dev        # :3000
```

## Verify single-instance Yjs (constraint from research D2)
```bash
pnpm --filter @asciidocollab/web why yjs    # expect exactly one resolved version
```

## US1 — Two-user co-editing
1. Sign in as **User A** (editor) in one browser; open a project text file.
2. Sign in as **User B** (editor) in a second browser/profile; open the same file.
3. Type in A → text appears in B within ~1 s, no cursor jump (SC-001).
4. Type simultaneously in both → both converge to identical text (SC-003).
5. Close both; reopen as a third session → all edits present (late join, SC-002).

## US2 — Presence
1. With A and B in the same file, move A's cursor and select a range.
2. B sees A's coloured cursor, name label, avatar, and selection highlight.
3. A does **not** see their own cursor overlay/avatar (FR-008).
4. Presence bar shows the other participant(s) and count.

## US3 — Collaborative undo
1. A types two edits; B types one edit between them.
2. A presses undo twice → only A's edits revert; B's edit remains (FR-011).
3. A presses redo → A's edits return.

## US4 — Read-only & offline fallback
1. **Observer**: sign in as a project **viewer**, open the file → editor is read-only, live edits/presence still visible (FR-012). Typing is rejected.
2. **Offline**: stop the collab process (`:4002`), open a file as an editor → editor opens read-only with an "editing unavailable" banner; no edits are silently lost (FR-013). Restart collab, reopen → editing resumes.

## Automated checks
```bash
pnpm --filter @asciidocollab/domain test    # GetDocumentCollabInfoUseCase
pnpm --filter @asciidocollab/api test        # GET …/collab route
pnpm --filter @asciidocollab/web test        # collab hooks/components, colorForUser
pnpm --filter @asciidocollab/web e2e         # collab-*.spec.ts (needs api+collab running)
```

## Production note (SEC5 / NFR-005)
WS authentication relies **only on the session cookie** — no token is placed in the URL, query string, subprotocol, or logs (the handshake URL carries just `documentName`; the auth hook forwards the `Cookie` header and logs are cookie-redacted). Therefore:

- **Transport**: serve the collaboration WebSocket over `wss://` in production (TLS at the edge). Internal Fastify↔Hocuspocus traffic stays plain HTTP per the Security Constitution.
- **Same-site cookie delivery**: the browser only attaches the session cookie to the handshake if collab shares a **registrable domain** with the web app — e.g. behind a reverse proxy, or `collab.example.com` with the session cookie scoped to `Domain=example.com`. The cookie is issued `SameSite=Strict` by default. See research D5.
- **Origin allowlist**: set `ASCIIDOCOLLAB_COLLAB_ALLOWED_ORIGINS` to the web app origin(s) so cross-site handshakes are rejected (CSWSH defence, SEC2).
