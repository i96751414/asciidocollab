import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state';
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

function buildDecorations(view: EditorView, getInheritedOffset: () => number): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const info of computeHeadingLevels(view.state.doc.toString(), getInheritedOffset())) {
    if (info.beyondMax) continue; // not a heading — leave as paragraph styling
    builder.add(info.from, info.from, Decoration.line({ class: headingLevelClass(info) }));
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
