# Implementation Plan: AsciiDoc List Auto-Continuation

**Branch**: `021-list-continuation` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-list-continuation/spec.md`

## Summary

Pressing Enter inside a recognized AsciiDoc list item (unordered, ordered, checklist,
description) auto-starts the next item with the matching marker, depth, and leading
indentation; pressing Enter on an empty item removes the marker and exits the list.
The change is **editor-source-only** and front-end only: a CodeMirror 6 `Enter` keymap
command, registered at `Prec.high` so it runs before `defaultKeymap`, that inspects the
current line, decides continue / exit / fall-through, and dispatches a **single
transaction** so both undo paths (native history on the REST path, `Y.UndoManager` on the
collab path) revert it in one step. List-item parsing lives in a pure, dependency-free
module that is unit-tested in isolation; verbatim/delimited-block suppression (FR-008)
reuses the existing Lezer syntax tree, extended with a small `literalDelim` token so the
literal `....` block is recognized alongside the listing/passthrough/comment/table blocks
the grammar already covers.

## Technical Context

**Language/Version**: TypeScript 6.x (strict), Node ≥ 24, React 19

**Primary Dependencies**: CodeMirror 6 (`@codemirror/view`, `@codemirror/state`,
`@codemirror/language`, `@codemirror/commands`), `y-codemirror.next` + `yjs` (collab
path), existing in-repo AsciiDoc Lezer grammar (`asciidoc-language.ts`,
`asciidoc-block-tokens.ts`)

**Storage**: N/A — no persistence, schema, or API changes. Operates on the in-memory
editor document only; collab edits propagate through the existing `Y.Text('codemirror')`
binding.

**Testing**: Jest + Testing Library. Pure parser → `node` project
(`tests/**/*.test.ts`); command behavior against a real `EditorState`/`EditorView` in the
`jsdom` project (`tests/**/*.test.tsx`).

**Target Platform**: Browser (Next.js 16 client component — the editor)

**Project Type**: Web application (modular monolith); this feature touches only
`apps/web`.

**Performance Goals**: Keystroke handler MUST be imperceptible (< 1 frame, ~16 ms) for
documents of typical size; parsing is single-line and O(marker length).

**Constraints**: No change to rendered/preview output or content semantics beyond the
inserted/removed marker characters (FR-009). Each continuation and each exit is a single
undo/redo step (FR-010). No regression to plain-newline behavior off-list (FR-011).

**Scale/Scope**: One new pure module (`asciidoc-list-item.ts`), one new command/extension
module (`asciidoc-list-continuation.ts`), one wiring line in `use-editor-mount.ts`, and a
set of small grammar additions (`asciidoc.grammar`, `asciidoc-block-tokens.ts`,
`asciidoc-language.ts`, regenerated parser) to keep highlighting in lockstep with
continuation: a `literalDelim`/`LiteralBlock` for the literal `....` block (FR-008),
explicit-number ordered markers (`1.`), dash checklists (`- [ ]`), and the `;;` description
separator. Four list types, 13 functional requirements, four user stories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### I. Clean Code

- PASS — Marker parsing is a pure function returning a typed `ListMarker` descriptor (a
  value object), separated from the side-effecting CodeMirror command. Marker characters,
  separators, and character codes are named constants, not magic literals. The command
  reads as continue / exit / fall-through. No `any`, no `as` casts (P0 violations 5 & 6).

### II. Test-Driven Development (NON-NEGOTIABLE)

- PASS — Every acceptance scenario maps to a failing test first. The pure parser is
  exhaustively unit-tested (each marker type, nesting depth, empty-item, checkbox-reset,
  mid-line split inputs). The command is tested against a real `EditorState`/`EditorView`
  driving the `Enter` binding and asserting resulting doc + selection, including the
  single-undo and verbatim-suppression cases. No production line is written before its red
  test.

### III. Seam Testing with In-Memory Fakes

- N/A (no repository interfaces) — This is a front-end editor behavior with no domain
  port. The relevant seam is the pure parser, exercised directly with string inputs (no
  CodeMirror needed); the CodeMirror integration is tested with a real `EditorView`, not a
  mock of editor internals.

### Architecture Constitution

- PASS — Front-end-only change confined to `apps/web`; no domain/application/infrastructure
  edits, so the inward dependency rule is untouched. Honors the **CodeMirror 6** technology
  mandate (keymap + `StateCommand`, no alternative editor). Reuses the existing Lezer
  grammar for block detection rather than introducing a parallel parser. Tests live under
  `apps/web/tests/lib/codemirror/` mirroring source — no `__tests__/`, no co-location (P0
  violation 7 avoided). No Prisma/schema/migration involvement.

### Security Constitution

- PASS — No new external input, endpoint, secret, or data flow. Inserted text is derived
  solely from the user's own current line; nothing is logged or transmitted beyond the
  existing collab sync. No trust-boundary change.

**Result: PASS — no violations, Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/021-list-continuation/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── enter-command.md # Phase 1 output — behavioral contract for the Enter command
├── checklists/          # (pre-existing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── lib/codemirror/
│   │   ├── asciidoc-list-item.ts            # NEW — pure: parse a line → ListMarker | null
│   │   ├── asciidoc-list-continuation.ts    # NEW — Enter keymap command + extension
│   │   ├── asciidoc.grammar                 # MODIFIED — literalDelim/LiteralBlock (FR-008) + explicit-ordered, dash-checklist, `;;` tokens
│   │   ├── asciidoc-block-tokens.ts         # MODIFIED — emit literalDelim (`....`), `\d+\.` ordered, `-` checklist, `;;` description
│   │   ├── asciidoc-language.ts             # MODIFIED — map LiteralBlock highlight; syntaxTree source for suppression
│   │   ├── asciidoc-parser.js / .terms.js   # REGENERATED — via lezer-generator (predev/prebuild)
│   │   └── …
│   └── hooks/
│       └── use-editor-mount.ts              # MODIFIED — register the Enter command at Prec.high
└── tests/
    └── lib/codemirror/
        ├── asciidoc-list-item.test.ts       # NEW — pure parser unit tests (node project)
        ├── asciidoc-list-continuation.test.tsx  # NEW — command behavior tests (jsdom project)
        ├── asciidoc-grammar.test.ts         # MODIFIED — add literal `....`, explicit `1.`, `- [ ]`, `;;` cases
        └── asciidoc-highlight.test.ts       # NEW — highlight-consistency: new constructs match existing siblings
```

**Structure Decision**: Web application — only the `apps/web` front-end is involved. New
logic is split into a **pure parser** (`asciidoc-list-item.ts`, no CodeMirror imports, so
it runs in the fast `node` Jest project) and a thin **CodeMirror command**
(`asciidoc-list-continuation.ts`) that owns selection handling, syntax-tree block
suppression, and single-transaction dispatch. Registration is one added line in the
existing `use-editor-mount.ts` extension array, placed at higher precedence than
`defaultKeymap` so list lines are handled first and all other lines fall through unchanged.
A set of small, self-contained grammar additions extends the existing Lezer parser:
`literalDelim` → `LiteralBlock` lets the command's block-suppression cover the literal `....`
block uniformly through the syntax tree (FR-008) rather than special-casing it; and
explicit-number ordered (`1.`), dash checklist (`- [ ]`), and `;;` description tokens keep
the editor's highlighting in lockstep with what the continuation command acts on (decided in
the AsciiDoc-syntax review — research D3). For highlight **consistency**, those three reuse the
existing `OrderedListItem`/`ChecklistItem`/`DescriptionList` nodes and inherit their colors, so
`LiteralBlock: t.content` (matching `ListingBlock`) is the only new styleTags entry and no new
`--syntax-*` color var is added. Authoritative token colors live in `asciidoc-theme.ts`
(applied at `Prec.highest`, winning over `asciidoc-highlight.ts`); a new
`asciidoc-highlight.test.ts` asserts each new construct's highlight class matches its existing
sibling.

## Complexity Tracking

> Not applicable — Constitution Check passed with no violations.
