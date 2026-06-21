import { Facet, StateField } from '@codemirror/state';
import type { EditorState, Transaction } from '@codemirror/state';
import {
  computeHeadingLevels,
  inheritedHeadingOffsetFacet,
  refreshHeadingLevelsEffect,
} from './asciidoc-heading-levels';
import { ConditionalRegionStack } from '@/lib/asciidoc/conditional-regions';
import { substitutePathAttributes } from '@/lib/asciidoc/include-path';

/** An entry in the section outline panel. */
export interface SectionOutlineEntry {
  /** Effective heading level (0–5, 0 = document title) — the raw marker level shifted by `:leveloffset:`. */
  level: number;
  /** Heading title text, with `{attr}` references resolved against the file's cross-document scope. */
  title: string;
  /** Line number of the heading. */
  line: number;
  /** Document offset of the heading line start. */
  from: number;
  /**
   * True when the heading sits inside a conditional region (`ifdef`/`ifndef`/`ifeval`) that resolves
   * inactive for the current attribute state (FR-032). Inactive headings are excluded from the
   * outline below — the flag is retained on the entry type for callers that prefer to mark them.
   */
  inactive?: boolean;

  // ── Provenance fields (feature 032: full-document outline across includes) ──
  // Present only in the assembled/full-document outline. Absent (undefined) in the current-file
  // scope, so existing single-file callers compile and behave unchanged.

  /** Project file node id the heading was authored in. */
  sourceFileId?: string;
  /** Project-relative path of the source file (for cross-file navigation). */
  sourcePath?: string;
  /**
   * 1-based line of the heading within its source file (≠ assembled line).
   * Used by cross-file navigation and presence mapping.
   */
  sourceLine?: number;
  /**
   * True when `sourceFileId` equals the currently-open file — drives the open-file mark (FR-018).
   */
  isOpenFile?: boolean;
}

/** Strips the `={1,6}` marker (and following whitespace) from a heading line to get its title. */
const HEADING_PREFIX_RE = /^={1,6}\s+/;

const EMPTY_SCOPE: ReadonlyMap<string, string> = new Map();

/**
 * Facet carrying an accessor for the open file's RESOLVED cross-document attribute scope (lowercase
 * name → value). The outline reads it to (a) resolve `{attr}` references in heading titles and (b)
 * evaluate conditional (`ifdef`/`ifndef`/`ifeval`) regions so a heading inside an inactive branch is
 * excluded — keeping the outline consistent with the rendered preview (R11/FR-032). It is supplied
 * lazily so a refresh effect re-evaluates the outline once the symbol index resolves new values,
 * without a document edit. Defaults to `() => ∅` (no cross-document scope known).
 */
export const outlineResolvedScopeFacet = Facet.define<
  () => ReadonlyMap<string, string>,
  () => ReadonlyMap<string, string>
>({
  combine: (values) => (values.length > 0 ? values[0] : () => EMPTY_SCOPE),
});

/** Reads the current include-path inherited heading-level offset from the facet (0 if unset). */
function inheritedOffset(state: EditorState): number {
  return state.facet(inheritedHeadingOffsetFacet)();
}

/** Reads the open file's resolved cross-document attribute scope from the facet (empty if unset). */
function resolvedScope(state: EditorState): ReadonlyMap<string, string> {
  return state.facet(outlineResolvedScopeFacet)();
}

/**
 * Scans the document for conditional preprocessor regions and returns, for each 1-based line, whether
 * it sits inside a branch that resolves INACTIVE for `scope`. A region is active only when every
 * enclosing conditional evaluates true; nested conditionals compound (an inner region inside an
 * inactive outer region stays inactive regardless of its own test). Mirrors the inline dimming so the
 * outline agrees with what the preview renders (FR-032). Uses {@link parseConditional}/
 * {@link evaluateConditional} (no `eval`) — the single conditional authority.
 */
function computeInactiveLines(documentText: string, scope: ReadonlyMap<string, string>): boolean[] {
  const lines = documentText.split('\n');
  // Per-line inactive flag, 1-based (index 0 unused) to match `computeHeadingLevels` line numbers.
  const inactive: boolean[] = Array.from({ length: lines.length + 1 }, () => false);
  // The shared region stack: a directive line moves it (a single-line `ifdef::name[text]` content form
  // is NOT a region opener, so it never gates the lines below it), then the line is inactive iff any
  // enclosing region is inactive — nesting compounds automatically.
  const stack = new ConditionalRegionStack();
  for (const [index, line] of lines.entries()) {
    stack.applyLine(line, scope);
    inactive[index + 1] = !stack.isActive();
  }
  return inactive;
}

/**
 * Derives the section outline from {@link computeHeadingLevels} — the single editor authority for
 * effective heading levels — so it stays consistent with the heading highlight and section folding.
 * Headings whose effective level (raw + `:leveloffset:` + inherited offset) exceeds the max are not
 * headings (FR-010) and are excluded, as are `[discrete]`/`[float]` headings (FR-072). The
 * document title (effective level 0) IS included (FR-028) so it anchors the outline tree. Titles
 * have their `{attr}` references resolved against the
 * file's cross-document scope, and headings inside an inactive conditional branch are excluded so
 * the outline matches the rendered preview (R11/FR-032).
 */
function extractHeadings(state: EditorState): SectionOutlineEntry[] {
  const entries: SectionOutlineEntry[] = [];
  const documentText = state.doc.toString();
  const scope = resolvedScope(state);
  const inactiveLines = computeInactiveLines(documentText, scope);

  for (const info of computeHeadingLevels(documentText, inheritedOffset(state))) {
    // beyondMax ⇒ not a heading; discrete ⇒ styled but excluded. Level 0 (the document title) IS
    // kept (FR-028) so it anchors the outline tree; only a negative effective level is skipped.
    if (info.beyondMax || info.discrete || info.effectiveLevel < 0) continue;
    // A heading inside a conditional branch that resolves inactive is excluded — it would not render
    // in the preview, so showing it in the outline would mislead navigation (R11/FR-032).
    if (inactiveLines[info.line]) continue;

    const rawLine = state.doc.line(info.line).text;
    const prefixMatch = rawLine.match(HEADING_PREFIX_RE);
    const rawTitle = prefixMatch ? rawLine.slice(prefixMatch[0].length) : rawLine;
    // Resolve `{attr}` references against the resolved scope (unknown refs are left verbatim) so the
    // outline shows the same title the preview renders (R11). Case-insensitive, Asciidoctor semantics.
    const title = substitutePathAttributes(rawTitle, scope).trim();

    entries.push({
      level: info.effectiveLevel,
      title,
      line: info.line,
      from: info.from,
    });
  }

  return entries;
}

/** CM6 StateField that tracks the current section outline from the effective heading levels. */
export const outlineField = StateField.define<SectionOutlineEntry[]>({
  create(state: EditorState) {
    return extractHeadings(state);
  },
  update(entries: SectionOutlineEntry[], tr: Transaction) {
    // Recompute on a doc edit, or when out-of-band state changed and the heading-levels refresh
    // effect is dispatched (FR-007a/FR-007b/071): the inherited offset OR the resolved cross-document
    // scope changed (the outline hook routes both through refreshHeadingLevelsEffect, keeping
    // computeHeadingLevels the single recompute trigger). Either can change effective levels,
    // resolved titles, or inactive-branch marking without a document edit.
    const refreshed = tr.effects.some((effect) => effect.is(refreshHeadingLevelsEffect));
    if (!tr.docChanged && !refreshed) return entries;
    return extractHeadings(tr.state);
  },
});
