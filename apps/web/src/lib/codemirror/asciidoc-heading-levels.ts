import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Facet, RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state';
import { computeHeadingLevels, type HeadingLevelInfo } from './asciidoc-effective-levels';

/**
 * CodeMirror projection of the effective-heading-level rule (US3, FR-009/010/071/072).
 *
 * The effective-level computation is editor presentation logic and lives next to this module
 * ({@link computeHeadingLevels} in `./asciidoc-effective-levels`). It is deliberately NOT in
 * `@asciidocollab/shared` (DTOs only) nor the domain (the frontend does not depend on the domain).
 * This module only maps that result to CSS line decorations and feeds in the include-path inherited
 * offset (from the symbol index), recomputing when that offset changes.
 */

// Re-exported for the in-editor fold/outline consumers that import them here.
export { MAX_HEADING_LEVEL, computeHeadingLevels, parseLevelOffset } from './asciidoc-effective-levels';
export type { HeadingLevelInfo, LevelOffsetOp } from './asciidoc-effective-levels';

/** CSS class applied to a heading line for its effective level (e.g. `cm-ad-h2`). */
export function headingLevelClass(info: HeadingLevelInfo): string {
  const classes = [`cm-ad-h${info.effectiveLevel}`];
  if (info.discrete) classes.push('cm-ad-discrete');
  return classes.join(' ');
}

/**
 * Dispatch this effect to force heading levels to recompute when nothing in the document changed,
 * such as when the include-path inherited offset changes because the project main file was
 * reconfigured (FR-045a/071).
 */
export const refreshHeadingLevelsEffect = StateEffect.define<void>();

/**
 * Facet carrying the include-path inherited heading-level offset accessor (FR-071). It lets
 * consumers that cannot take the accessor as a constructor argument — such as the outline
 * StateField — read the same offset the heading-levels ViewPlugin uses, so they derive identical
 * effective levels. It defaults to `() => 0` (the file is the include root).
 */
export const inheritedHeadingOffsetFacet = Facet.define<() => number, () => number>({
  combine: (values) => (values.length > 0 ? values[0] : () => 0),
});

/** Line-decoration class flagging a section marker whose effective level exceeds the max (FR-010). */
const SUPPRESSED_HEADING_CLASS = 'cm-ad-suppressed-heading';

function buildDecorations(view: EditorView, getInheritedOffset: () => number): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const info of computeHeadingLevels(view.state.doc.toString(), getInheritedOffset())) {
    // A heading whose effective level exceeds the max is not a heading (FR-010). The Lezer grammar
    // still tokenises it as a Heading (it cannot know the active :leveloffset:), so tag the line to
    // neutralise the grammar's heading colour and render it as body text — see asciidoc-theme.ts.
    const cls = info.beyondMax ? SUPPRESSED_HEADING_CLASS : headingLevelClass(info);
    builder.add(info.from, info.from, Decoration.line({ class: cls }));
  }
  return builder.finish();
}

/**
 * CodeMirror extension that styles each heading line by its effective level, marks discrete
 * headings, and drops heading styling beyond the max level. `getInheritedOffset` supplies the
 * include-path offset (from the symbol index, US8); it is read lazily so a {@link
 * refreshHeadingLevelsEffect} re-evaluates levels when the offset changes without a doc edit.
 *
 * @param getInheritedOffset - Returns the current include-path inherited offset (default 0).
 * @returns The heading-levels view plugin.
 */
export function asciidocHeadingLevels(getInheritedOffset: () => number = () => 0): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getInheritedOffset);
      }

      update(update: ViewUpdate) {
        const refreshed = update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(refreshHeadingLevelsEffect)),
        );
        if (update.docChanged || update.viewportChanged || refreshed) {
          this.decorations = buildDecorations(update.view, getInheritedOffset);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
