# Quickstart: Persist & Restore File Selection

How to build, test, and manually verify this feature.

## Scope at a glance

- **Where**: `apps/web` only (hooks + editor + project layout). No API/DB.
- **New files**: `hooks/use-last-selection.ts`, its test, and an E2E spec.
- **Edited files**: `use-file-selection.ts`, `use-editor-mount.ts`, `asciidoc-editor.tsx`, `project-editor-layout.tsx`.

## Run the gates (TDD loop)

```bash
# Unit (fast inner loop) — web only
pnpm --filter @asciidocollab/web exec jest apps/web/tests/hooks/use-last-selection.test.ts
pnpm --filter @asciidocollab/web exec jest apps/web/tests/components/editor/asciidoc-editor.test.tsx

# Lint + types for the package
npx eslint apps/web
npx tsc -p apps/web/tsconfig.json --noEmit

# Full local pre-merge gate (incl. isolated e2e)
pnpm gate
```

> Per the project's quality-gate notes, run web coverage with
> `pnpm --filter @asciidocollab/web exec jest --coverage` (not the broken CI `-- --coverage` form),
> and clear `apps/web/.next` before an e2e run if it was previously built by `next dev`.

## Manual verification (matches the acceptance scenarios)

Start the dev stack (`scripts/dev.sh`), sign in, open a project.

1. **US1 — file restore**
   - Select `some-file.adoc` in the tree.
   - Click **Settings** in the header, then **← Back to projects** → reopen the same project (or use the browser Back button).
   - ✅ The same file is selected and its content is shown — no manual click.

2. **US1 — reveal in collapsed tree (FR-012)**
   - Select a file that lives a few folders deep, then collapse those folders (or just rely on them being collapsed on next load).
   - Navigate to Settings and back (or reload).
   - ✅ The ancestor folders expand and the file's row is scrolled into view and highlighted — not just shown in the editor.
   - Now manually collapse the folder containing the selected file. ✅ It stays collapsed (reveal does not fight you).

3. **US1 — survives reload & is per-project**
   - With a file open, hard-reload the page. ✅ File still selected.
   - Open a second project, select a different file, switch back and forth. ✅ Each project restores its own file.

4. **US2 — cursor line restore (AsciiDoc)**
   - In an `.adoc` file, click near line 40 and wait ~1s.
   - Navigate to Settings and back. ✅ Editor opens scrolled to ~line 40 with the cursor there.
   - Delete content so the doc is shorter than 40 lines, navigate away and back. ✅ Cursor lands on the last line, no error.

5. **US3 — deleted file fallback**
   - Select a file, then delete it (via the tree, or from another session).
   - Return to the project. ✅ No error; the editor shows "Select a file from the tree…". Reload again ✅ it does not try to reopen the deleted file (memory cleared).

6. **Non-AsciiDoc**
   - Select an image/binary file, navigate away and back. ✅ Same file reselected; no line behavior applied.

## Inspecting the stored state

In DevTools → Application → Local Storage:

```
key:   asciidocollab:last-selection:<userId>:<projectId>
value: {"nodeId":"…","nodeName":"intro.adoc","nodeType":"file","path":"/intro.adoc","line":40}
```

Deleting this key resets the project to "no remembered selection". Signing in as a different account on the same browser uses a different `<userId>` segment, so selections never cross between users.

> **Restore latency (SC-003)**: restoration reads `localStorage` synchronously on mount, so the file/line is restored before first interaction — perceptibly instant, well under the 1s target. Confirm in step 1 that there is no visible delay or flash of "no file selected".
