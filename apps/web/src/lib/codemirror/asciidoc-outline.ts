import { StateField } from '@codemirror/state';
import type { EditorState, Transaction } from '@codemirror/state';
import {
  computeHeadingLevels,
  inheritedHeadingOffsetFacet,
  refreshHeadingLevelsEffect,
} from './asciidoc-heading-levels';

/** An entry in the section outline panel. */
export interface SectionOutlineEntry {
  /** Effective heading level (1–5) — the raw marker level shifted by `:leveloffset:`. */
  level: number;
  /** Heading title text. */
  title: string;
  /** Line number of the heading. */
  line: number;
  /** Document offset of the heading line start. */
  from: number;
}

/** Strips the `={1,6}` marker (and following whitespace) from a heading line to get its title. */
const HEADING_PREFIX_RE = /^={1,6}\s+/;

/** Reads the current include-path inherited heading-level offset from the facet (0 if unset). */
function inheritedOffset(state: EditorState): number {
  return state.facet(inheritedHeadingOffsetFacet)();
}

/**
 * Derives the section outline from {@link computeHeadingLevels} — the single editor authority for
 * effective heading levels — so it stays consistent with the heading highlight and section folding.
 * Headings whose effective level (raw + `:leveloffset:` + inherited offset) exceeds the max are not
 * headings (FR-010) and are excluded, as are `[discrete]`/`[float]` headings (FR-072) and the
 * document title (effective level 0).
 */
function extractHeadings(state: EditorState): SectionOutlineEntry[] {
  const entries: SectionOutlineEntry[] = [];

  for (const info of computeHeadingLevels(state.doc.toString(), inheritedOffset(state))) {
    // beyondMax ⇒ not a heading; discrete ⇒ styled but excluded; level < 1 ⇒ document title.
    if (info.beyondMax || info.discrete || info.effectiveLevel < 1) continue;

    const rawLine = state.doc.line(info.line).text;
    const prefixMatch = rawLine.match(HEADING_PREFIX_RE);
    const title = prefixMatch ? rawLine.slice(prefixMatch[0].length) : rawLine;

    entries.push({
      level: info.effectiveLevel,
      title: title.trim(),
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
    // Recompute on a doc edit, or when the inherited offset changed out-of-band (FR-071) and the
    // heading-levels refresh effect is dispatched — both can change effective levels.
    const refreshed = tr.effects.some((effect) => effect.is(refreshHeadingLevelsEffect));
    if (!tr.docChanged && !refreshed) return entries;
    return extractHeadings(tr.state);
  },
});
