# Quickstart: Verify Up-to-Date Downloads

**Feature**: 031-up-to-date-downloads

How to confirm the feature works, for a developer or reviewer.

## Automated (primary)

Run the affected suites (TDD order: these are written before implementation and must go red→green):

```bash
# Domain use cases (in-memory fakes — fast, no infra)
pnpm --filter @asciidocollab/domain test download-file download-project

# API route integration tests
pnpm --filter @asciidocollab/api test file-download download
```

Gates before commit (Constitution Quality Gates):

```bash
pnpm lint
pnpm typecheck
```

Key assertions (see contracts/downloads.md §Test contract):
- Live document with an active session ⇒ downloaded bytes equal the **live Yjs text**, not the disk projection.
- Active session but collab unreachable ⇒ download still succeeds from disk, `warn` logged.
- Dormant document / binary asset ⇒ served from disk; collab reader NOT consulted.
- Authorization (non-member 403, folder 400, IDOR 404) unchanged.

## Manual (end-to-end smoke)

1. Start the stack (`./scripts/dev.sh`): `apps/api`, `apps/collab`, `apps/web`, Postgres.
2. Open a project, open an `.adoc` document in the editor, and type a distinctive change (e.g. `LIVE-EDIT-MARKER`). **Do not wait** for the write-back interval.
3. Immediately, from the file tree, choose **Download** on that file.
   - Expected: the downloaded file contains `LIVE-EDIT-MARKER`.
4. From the project root, choose **Download ZIP**.
   - Expected: that document inside the archive also contains `LIVE-EDIT-MARKER`; other files are present and unchanged; images are intact.
5. Stop `apps/collab` only, then download the same file again.
   - Expected: the download still succeeds, returning the last content written to disk (graceful fallback), and `apps/api` logs a live-read fallback `warn`.

## What "done" looks like

- A change typed moments ago appears in both single-file and ZIP downloads without waiting for any sync interval (SC-001, SC-002).
- Downloads never fail because the collab server is busy or down (SC-003).
- No torn/partial document content; no missing recently-typed edits (SC-005).
- No new way for an unauthorized user to download (SC-006).
