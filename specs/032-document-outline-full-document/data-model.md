# Phase 1 Data Model: Full-Document Outline Across Includes

**Feature**: 032 | **Date**: 2026-06-21

These are in-memory/client view models and the awareness wire shape. No database tables, no migrations.

---

## 1. `OutlineEntry` (extends existing `SectionOutlineEntry`)

Existing shape (`lib/codemirror/asciidoc-outline.ts`):

```text
SectionOutlineEntry {
  level: number        // 0–5 effective (raw + leveloffset)
  title: string        // {attr} refs resolved
  line: number         // 1-based, within the *open* document
  from: number         // byte offset within the open document
  inactive?: boolean   // in an inactive conditional branch
}
```

**Added provenance fields** (populated only for the assembled/full-document outline; absent/identity in current-file scope):

| Field | Type | Rule |
|-------|------|------|
| `sourceFileId` | `string` | Project file node id the heading was authored in. In current-file scope, the open file. |
| `sourcePath` | `string` | Project-relative path of the source file (for cross-file navigation). |
| `sourceLine` | `number` (1-based) | Line of the heading **within its source file** (≠ assembled line). Used by navigation + presence mapping. |
| `isOpenFile` | `boolean` | True when `sourceFileId` == currently open file → drives the open-file mark (FR-018). |

**Validation / invariants**:
- `level` ∈ [0, 5]; entries with effective level < 0, `[discrete]`/`[float]`, or inside inactive conditionals are excluded (existing rule, applied across all files).
- `sourceLine` ∈ [1, sourceFile.lineCount].
- An entry is uniquely identified by `(sourceFileId, sourceLine)` within one assembly.
- Order = assembled document order (seamless; no per-file grouping — FR-017).

---

## 2. `AssembledOutline`

Result of `assemble-outline.ts`.

| Field | Type | Rule |
|-------|------|------|
| `entries` | `OutlineEntry[]` | In assembled order. |
| `scope` | `'full' \| 'current'` | Which scope produced it (effective, after fallback). |
| `unresolved` | `UnresolvedInclude[]` | Pass-through from `assembleIncludes` (missing/inaccessible includes) — outline degrades gracefully (FR-014). |
| `rootFileId` | `string \| null` | Main document used; `null` when no main document (→ current-file fallback, FR-005). |

**State transitions** (effective scope resolution):

```text
stored pref = 'full'
  ├─ main document configured AND open file reachable  → scope = 'full'
  ├─ main document configured AND open file UNreachable → scope = 'current' (FR-006)
  └─ no main document                                   → scope = 'current' (FR-005)
stored pref = 'current'                                 → scope = 'current' (FR-004)
```

Recompute triggers (FR-013): open-file edit; main-document setting change; include-structure change; relevant attribute change; **reachable included-doc change** (D3); scope-option change.

---

## 3. `IncludeSourceMap` (new output of `assembleIncludes`)

| Field | Type | Rule |
|-------|------|------|
| `lineToSource` | `Array<{ fileId: string; path: string; sourceLine: number }>` | Indexed by 1-based assembled line → origin. Length == assembled line count. |

- Additive: only built when `options.withSourceMap` is set. When absent, `assembleIncludes` output is unchanged (regression-locked).
- For synthesized lines (e.g., placeholder lines when `showIncludes=false`) the entry points at the include directive's own file/line.

---

## 4. `PresenceState` (extended awareness wire shape)

Existing (`use-project-presence.ts`, project presence room):

```text
PresenceState {
  user?: AwarenessUser            // { userId, name, color, colorLight, avatarUrl? }
  openFileNodeId?: string | null
}
```

**Added field**:

| Field | Type | Rule |
|-------|------|------|
| `cursorLine` | `number \| null` | 1-based line of the **heading the local user's cursor is under** in the open file (their current section anchor), or `null` if none/at top. |

- Published by the local client on cursor/section change (debounced); cleared (`null`) when no file is open.
- **Untrusted on read**: peers' `cursorLine` is clamped to the referenced file's `[1, lineCount]`; out-of-range/missing → treated as "no section" (Principle IX, FR-024).

---

## 5. `OutlinePresence` (derived view model)

Produced by `outline-presence.ts`; consumed by `editor-section-outline.tsx`.

| Field | Type | Rule |
|-------|------|------|
| `byEntryKey` | `Map<string, ParticipantPresence[]>` | Key = `${sourceFileId}:${sourceLine}`. Value = **other** users whose current section maps to that entry. |

**Derivation**: for each remote peer with `(openFileNodeId = f, cursorLine = c)`, find the outline entry with `sourceFileId == f` and the greatest `sourceLine ≤ c` (nearest enclosing shown heading, FR-024); append the peer's `ParticipantPresence` (reused type) to that entry's list. Dedup per user, exclude self (reuse `collectByFile` semantics). Entries with no peers have no marker.

**Reuses** `ParticipantPresence` (`use-collab-presence.ts`) and renders via `OpenByOthersMarker` (`+N` overflow, hover names) unchanged.

---

## 6. `outlineScope` preference (client-only)

| Field | Type | Rule |
|-------|------|------|
| `outlineScope` | `'full' \| 'current'` | Default `'full'`. localStorage-only; added to `CLIENT_ONLY_KEYS`; never PUT to account (Principle VII). |

---

## Entity relationships

```text
Main document setting (project-scoped, existing)
        │ roots
        ▼
Include tree (reachable files) ──content──▶ useProjectSymbolIndex (live + fallback)
        │ assembleIncludes(withSourceMap)
        ▼
assembled text + IncludeSourceMap
        │ extractHeadings (unchanged) + provenance attribution
        ▼
AssembledOutline { OutlineEntry[] }  ◀── outlineScope pref (full/current + fallback)
        │ keyed by (sourceFileId, sourceLine)
        ▼
EditorSectionOutline  ◀── OutlinePresence (from project presence room cursorLine)
```
