# Quickstart & Validation: Project-Wide Find and Replace

Manual/E2E validation mapped to the spec's Success Criteria. Two browser clients (A, B) on the same project verify the collaborative dual-path behavior.

## Setup

1. Run the dev stack (web + api + collab + postgres) per the repo's dev compose.
2. Open a project with several files, at least one of which is **not** open in any editor session (dormant) and one containing regex-special characters (`.`, `*`, `[`).
3. Client A opens file `X`; leave file `Y` (dormant) unopened anywhere.

## Story 1 — Project-wide search (P1)

- Open the left panel → **Search** tab (SC-006: framing identical to Files/Outline).
- Enter a term present in `X`, `Y`, and a third file → results grouped by file, per-file + true-total counts (FR-004). **SC-001**: `Y`'s matches appear without opening it.
- Click a result in `Y` → `Y` opens, cursor on the match (FR-005, **SC-003**).
- Toggle case-sensitivity → results update.
- Type a term in `X` in client A **without saving**; search from client A → the just-typed match appears (live content, FR-007).
- Enter a non-matching query → explicit no-results state (FR-015).

## Story 2 — Replace across the project (P2)

- Search a term in `X` (open) and `Y` (dormant). Enter replacement text.
- **Exclude** one match via its toggle; **replace all**. Confirm the scope dialog shows match/file counts (FR-009).
- **SC-004**: re-run the same search → zero remaining matches for the included ones; the excluded occurrence remains (FR-008a).
- **Open session path**: client B has `X` open during the replace → the change appears live in B, merged with any concurrent typing (FR-011, **SC-005**).
- **Dormant path**: `Y` was never opened → open it after the replace → the replacement is present and persisted (FR-010). (Under the hood: `openDirectConnection` loaded it from Yjs state, applied, wrote back.)
- Open `X`, invoke editor **undo** → the replacement reverts via the file's own history (FR-018). Confirm there is no cross-file bulk-undo.
- Check the project audit history → a `project.content_replaced` entry with counts (FR-012).

## Story 3 — Consistent styling (P3)

- Open the in-editor find/replace (Ctrl/Cmd-F) → inputs/buttons/toggles match the design system in **light and dark** (FR-014, **SC-006**).
- Switch Files ↔ Outline ↔ Search → Search tab framing is indistinguishable (rail icon, active bar, header, spacing).
- Collapse and reload the page with Search active → it restores as the active tab (FR-002, **SC-007**).

## Security / regex safety (SC-008, FR-006)

- Regex mode: enter a valid pattern with a capture group and a `$1` replacement → matches and substitutes correctly (FR-006, FR-006d).
- Enter an **invalid** pattern → inline error, nothing runs (FR-006b).
- Enter a known catastrophic-backtracking pattern (e.g. `(a+)+$`) against files containing long `a…` runs → search returns **bounded** results quickly; the UI never freezes and client B's editing stays responsive (**SC-008** — RE2 linear-time + per-file budget).
- Enter literal mode with `a.b` → matches the literal `a.b`, not the regex sense (FR-006 literal semantics).
- Confirm search/replace cannot reach another project's files (data isolation).

## Automated coverage (per Constitution — via `/tdd`)

- **Domain unit** (in-memory fakes): search RBAC + scan + budgets/cap + true-total; replace RBAC + selection/stale-skip + audit; `text-match` literal/whole-word/regex (fake engine); `searchable-text-file` predicate.
- **Infra integration**: `Re2RegexEngine` linear-time behavior + invalid-pattern rejection; `HttpStructuredCollaborativeEditor` round-trip.
- **Collab integration**: `applyStructuredReplacementToDocument` against a real `Y.Doc` for open-room, dormant-room, concurrent-edit-merge, and stale-skip cases.
- **API route**: search/replace schema validation, 400/403/429 paths, rate-limit config.
- **E2E (Playwright, two-client)**: Stories 1–2 (open + dormant), regex substitution, per-match exclude, in-editor restyle + scroll-sync no-regression.
