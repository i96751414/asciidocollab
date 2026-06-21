# Contract: Outline UI

**Feature**: 032 | React component / hook contracts in `apps/web`.

---

## `useEditorPreferences` — add client-only `outlineScope`

```text
+ outlineScope: 'full' | 'current'         // default 'full'
+ setOutlineScope(scope: 'full' | 'current'): void   // localStorage only, no account PUT
```
- Added to `CLIENT_ONLY_KEYS`; stripped from the account payload; kept on fetch-merge (mirror `leftPanelTab`/`showIncludedFiles`).

---

## `useSectionOutline` — scope-aware

```text
useSectionOutline(input: {
  view: EditorView | null;
  scopePreference: 'full' | 'current';
  rootFilePath: string | null;
  openFile: { id: string; path: string };
  readFile / fileIdForPath / resolvedScope;  // from symbol index
}): { entries: OutlineEntry[]; effectiveScope: 'full' | 'current'; unresolved: UnresolvedInclude[] }
```
- `current` (or fallback) → existing CM6-view extraction (unchanged behavior).
- `full` → `assembleOutline(...)`; recomputes on the triggers in data-model §2 (incl. reachable-doc change, debounced).

---

## `OutlineView` — scope toggle + states

- Adds a **scope toggle** (full document ↔ current file) bound to `outlineScope`. Hidden/disabled when no main document is configured (effective scope forced to `current`, FR-005).
- Empty/fallback states: no headings; main-doc set but open file unreachable (shows current-file outline — FR-006).
- Passes `OutlinePresence` map + `currentIndex` down.

## `EditorSectionOutline` — render marks + presence

```text
EditorSectionOutline(props: {
  entries: OutlineEntry[];
  currentIndex: number;                 // existing — current section (open file)
  onHeadingClick(entry: OutlineEntry): void;
  presenceByEntryKey: Map<string, ParticipantPresence[]>;  // NEW
})
```
- Each entry: existing button + indent (`level * 12 + 8`) + `aria-current`.
- **Open-file mark** when `entry.isOpenFile` (FR-018) — token-based styling.
- **Presence**: when `presenceByEntryKey.get(`${entry.sourceFileId}:${entry.sourceLine}`)` is non-empty, render `<OpenByOthersMarker participants={...} />` inline (FR-019/021). Reused component; no new avatar code.
- Click → `onHeadingClick(entry)`; parent routes via provenance:
  - `entry.sourceFileId === openFileId` → `revealLine(entry.sourceLine)` (FR-008).
  - else → `pendingXrefLine = entry.sourceLine; handleNavigateToFile(entry.sourcePath)` (FR-007).

---

## Accessibility
- Presence marker keeps `OpenByOthersMarker`'s existing `tabIndex=0` + descriptive label.
- Open-file/current marks are not conveyed by color alone (reuse `aria-current` + icon/weight).
