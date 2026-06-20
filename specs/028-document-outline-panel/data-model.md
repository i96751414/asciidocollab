# Phase 1 Data Model: Document Outline View

This feature introduces **no persisted server data** and **no new entities in `domain`/`shared`**. It defines one derived client structure (already existing, lightly extended) and one new client preference field.

## 1. Heading entry — `SectionOutlineEntry` (existing, extended)

Source: `src/lib/codemirror/asciidoc-outline.ts`. Reused as-is; the only change is **including the level-0 document title**.

```ts
interface SectionOutlineEntry {
  /** Effective heading level: 0 = document title, 1–5 = section levels. (was 1–5) */
  level: number;
  /** Heading text, with {attr} references resolved. */
  title: string;
  /** 1-based source line of the heading (used for editor navigation). */
  line: number;
  /** Document offset of the heading line start (used by the in-editor dispatch). */
  from: number;
  /** True when inside an inactive conditional branch (already handled upstream). */
  inactive?: boolean;
}
```

| Field | Derivation | Notes |
|---|---|---|
| `level` | `computeHeadingLevels()` effective level | **Extension**: emit `0` (document title) instead of skipping it (`asciidoc-outline.ts:99`). Levels `0–5`. |
| `title` | resolved heading text | `{attr}` already substituted; rendered as React children (auto-escaped). |
| `line` | Lezer node line | Primary key for navigation (`handleLineClick(line)`). |
| `from` | Lezer node offset | Retained for the existing in-editor dispatch path. |
| `inactive` | conditional-region stack | Already computed; outline may still list or visually de-emphasize (no behavior change required). |

**Ordering**: document order (as emitted by the field). **Identity**: `(line, index)` for React keys (duplicate titles allowed — FR edge case). **Validation**: none added; entries are derived, never user-supplied or stored.

**Nesting (presentation)**: indent by `level` — level 0 (title) flush; each deeper level adds a fixed step. The existing renderer uses `paddingLeft: (level - 1) * 12 + 8`; this is adjusted to keep level 0 flush and indent 1–5 progressively.

## 2. Derived state — current section (not stored)

```ts
// Pure selector, unit-tested in isolation.
function currentHeadingIndex(entries: SectionOutlineEntry[], currentLine: number): number
```

- **Rule**: the current heading is the **last** entry whose `line ≤ currentLine` (nearest preceding heading). Returns `-1` when `currentLine` precedes the first heading (no row marked).
- **Input signal**: the editor's current cursor line (`onCursorChange.line`), fallback the top-of-viewport line (`onScrollLine`).
- **Invariant**: at most one entry is "current" at any time (FR-008 / SC-004).
- The current row gets `aria-current="true"` + the primary-tinted active style (left accent bar).

## 3. Preference — `leftPanelTab` (new client field)

Added to `EditorPrefs` in `src/hooks/use-editor-preferences.ts`.

```ts
type LeftPanelTab = 'files' | 'outline';

interface EditorPrefs {
  // …existing fields…
  leftPanelTab: LeftPanelTab;   // NEW
}

const DEFAULT_PREFS: EditorPrefs = {
  // …existing defaults…
  leftPanelTab: 'files',        // FR-005 default
};
```

| Aspect | Decision |
|---|---|
| **Storage** | `localStorage` only, under the existing key `asciidocollab:editor-preferences` (same store/hook — no parallel store). |
| **Default** | `'files'` (FR-005). |
| **Scope** | Per user, per browser (FR-010). |
| **Account sync** | **Excluded** from the `PUT /auth/me/editor-preferences` payload and from the GET-merge — stays client-only. **No server DTO change** (`packages/shared/src/dtos/editor-preferences.dto.ts` untouched). |
| **Setter** | `setLeftPanelTab(tab: LeftPanelTab)` following the existing setter pattern (state + localStorage write, no `schedulePut`). |
| **Validation on load** | `isStoredPrefs` accepts `leftPanelTab` only when it is `'files' | 'outline'`; otherwise falls back to default (FR-009 graceful fallback / spec edge case "stored preference missing or unreadable"). |

## 4. Component prop seams (new/changed)

```ts
// asciidoc-editor.tsx — surface outline + cursor line upward (additive optional props)
interface AsciiDocEditorProps {
  // …existing…
  onOutlineChange?: (entries: SectionOutlineEntry[]) => void;
  onCursorLineChange?: (line: number) => void;
}

// outline-view.tsx (NEW)
interface OutlineViewProps {
  entries: SectionOutlineEntry[];
  currentLine: number | null;     // drives currentHeadingIndex / aria-current
  hasDocument: boolean;           // false → "Open a document…" empty state
  onHeadingClick: (entry: SectionOutlineEntry) => void;  // → layout handleLineClick(entry.line)
}

// left-panel.tsx (NEW)
interface LeftPanelProps {
  activeTab: LeftPanelTab;
  onTabChange: (tab: LeftPanelTab) => void;
  filesSlot: React.ReactNode;     // the existing <FileTree> (+ its "+"/⋯ actions in the header)
  outlineSlot: React.ReactNode;   // <OutlineView>
}
```

**Empty states** (FR-012, exact copy):
- No document open / non-AsciiDoc → `"Open a document to see its outline."`
- Document with zero headings → `"No headings yet — add a section title (=, ==, …)."`
