import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Facet, RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state';
import { computeHeadingLevels, type HeadingLevelInfo, type IncludeResolutionContext } from './asciidoc-effective-levels';

/**
 * CodeMirror projection of the effective-heading-level rule.
 *
 * The effective-level computation is editor presentation logic and lives next to this module
 * ({@link computeHeadingLevels} in `./asciidoc-effective-levels`). It is deliberately NOT in
 * `@asciidocollab/shared` (DTOs only) nor the domain (the frontend does not depend on the domain).
 * This module only maps that result to CSS line decorations and feeds in the include-path inherited
 * offset (from the symbol index), recomputing when that offset changes.
 */

// Re-exported for the in-editor fold/outline consumers that import them here.
export { MAX_HEADING_LEVEL, computeHeadingLevels, parseLevelOffset } from './asciidoc-effective-levels';
export type { HeadingLevelInfo, LevelOffsetOp, IncludeResolutionContext } from './asciidoc-effective-levels';

/** CSS class applied to a heading line for its effective level (e.g. `cm-ad-h2`). */
export function headingLevelClass(info: HeadingLevelInfo): string {
  const classes = [`cm-ad-h${info.effectiveLevel}`];
  if (info.discrete) classes.push('cm-ad-discrete');
  return classes.join(' ');
}

/**
 * Dispatch this effect to force heading levels to recompute when nothing in the document changed,
 * such as when the include-path inherited offset changes because the project main file was
 * reconfigured.
 */
export const refreshHeadingLevelsEffect = StateEffect.define<void>();

/**
 * Facet carrying the include-path inherited heading-level offset accessor. It lets
 * consumers that cannot take the accessor as a constructor argument — such as the outline
 * StateField — read the same offset the heading-levels ViewPlugin uses, so they derive identical
 * effective levels. It defaults to `() => 0` (the file is the include root).
 */
export const inheritedHeadingOffsetFacet = Facet.define<() => number, () => number>({
  combine: (values) => (values.length > 0 ? values[0] : () => 0),
});

/** Line-decoration class flagging a section marker whose effective level exceeds the max. */
const SUPPRESSED_HEADING_CLASS = 'cm-ad-suppressed-heading';

/** Mark decoration applied to the leading `=` run of a heading line. */
const HEADING_MARKER_DECO = Decoration.mark({ class: 'cm-ad-heading-marker' });

function buildDecorations(
  view: EditorView,
  getInheritedOffset: () => number,
  getIncludeContext?: () => IncludeResolutionContext | null,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const includeContext = getIncludeContext?.() ?? undefined;
  for (const info of computeHeadingLevels(view.state.doc.toString(), getInheritedOffset(), includeContext)) {
    // A heading whose effective level exceeds the max is not a heading. The Lezer grammar
    // still tokenises it as a Heading (it cannot know the active :leveloffset:), so tag the line to
    // neutralise the grammar's heading colour and render it as body text — see asciidoc-theme.ts.
    const cls = info.beyondMax ? SUPPRESSED_HEADING_CLASS : headingLevelClass(info);
    builder.add(info.from, info.from, Decoration.line({ class: cls }));
    // Recede the leading `=` marker run so structural punctuation fades behind the heading text
    // RangeSetBuilder requires same-from entries in ascending-to order, so the
    // zero-length line decoration (above) must always precede this positive-length mark.
    if (!info.beyondMax) {
      const markerLength = info.rawLevel + 1;
      builder.add(info.from, info.from + markerLength, HEADING_MARKER_DECO);
    }
  }
  return builder.finish();
}

/**
 * CodeMirror extension that styles each heading line by its effective level, marks discrete
 * headings, and drops heading styling beyond the max level. `getInheritedOffset` supplies the
 * include-path offset (from the symbol index); it is read lazily so a {@link
 * refreshHeadingLevelsEffect} re-evaluates levels when the offset changes without a doc edit.
 *
 * @param getInheritedOffset - Returns the current include-path inherited offset (default 0).
 * @returns The heading-levels view plugin.
 */
export function asciidocHeadingLevels(
  getInheritedOffset: () => number = () => 0,
  getIncludeContext?: () => IncludeResolutionContext | null,
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getInheritedOffset, getIncludeContext);
      }

      update(update: ViewUpdate) {
        const refreshed = update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(refreshHeadingLevelsEffect)),
        );
        if (update.docChanged || update.viewportChanged || refreshed) {
          this.decorations = buildDecorations(update.view, getInheritedOffset, getIncludeContext);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
