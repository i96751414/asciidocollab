# Quickstart: In-Editor Symbol Rename Refactor Suggestion

## What it does
Rename a symbol at its definition (anchor/ID, attribute, or a section heading whose auto-ID is referenced). After you pause 2s, the editor offers a one-click, project-wide refactor of every usage to the new name, with single-step undo.

## Try it (manual)
1. Open a project with an attribute defined in one file and referenced (`{name}`) in others.
2. Edit the attribute definition (`:old-name:` → `:new-name:`) and stop typing.
3. After ~2s an inline suggestion appears: "Rename old-name → new-name in N references across M files". If the name has no other usages, nothing appears.
4. Keep typing — the suggestion withdraws and re-appears 2s after you stop, reflecting the latest name.
5. Move the cursor away — it disappears after ~5s. Return within 5s — it stays.
6. Click **Apply** — all references across the project (including files you don't have open) are rewritten; you see a count and can undo it in one step.
7. If the new name already exists as another symbol of the same kind, apply is **blocked** with a collision warning.

## Verify the guarantees
- **Collaboration**: usages in files open in a collab room reflect unsaved live edits; the applied rename converges for all collaborators.
- **Security/limits**: detection uses the read budget `project.refactoring.suggestionRateLimitMax` (default 600/h); apply uses `rateLimitMax` (default 60/h). Both configurable via `apps/api/config/default.yaml` / env.
- **Audit**: each apply records `AUDIT_SYMBOL_RENAMED`.

## Config
```yaml
# apps/api/config/default.yaml
project:
  refactoring:
    rateLimitMax: 60                    # apply budget
    rateLimitWindow: 3600000
    suggestionRateLimitMax: 600         # detection budget (new)
    suggestionRateLimitWindow: 3600000
```

## Key tests to run
- Domain: `packages/domain` unit tests for rename (incl. new heading-ID path) with in-memory fakes.
- API: integration tests for `symbol-usages` (heading kind, 429 on new budget) and `symbol-rename`.
- e2e (Playwright): the 2s/5s timing + return behavior, apply across files, collision block, and scroll-sync no-regression.
