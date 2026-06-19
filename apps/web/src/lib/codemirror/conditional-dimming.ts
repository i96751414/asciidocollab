import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { ConditionalRegionStack } from '@/lib/asciidoc/conditional-regions';
import { refreshCrossDocumentAttributesEffect } from '@/lib/codemirror/cross-document-attributes';

/**
 * Conditional-branch dimming (US12, FR-032).
 *
 * The grammar already tags `ifdef`/`ifndef`/`ifeval` directives as keywords. On top of that, the
 * content of any conditional branch that resolves inactive for the current resolved attribute state
 * is visually de-emphasised by reduced-opacity dimming while staying fully visible and editable, so
 * the editor matches what the preview renders. The dimming recomputes live as the controlling
 * attributes change: the shared {@link refreshCrossDocumentAttributesEffect} (dispatched when the
 * resolved scope changes) re-evaluates it without a document edit, mirroring the cross-document
 * attribute highlighting it shares that scope with.
 *
 * The active/inactive DECISION uses the single conditional authority (`parseConditional`/
 * `evaluateConditional`, no `eval`; Constitution IX) and mirrors the outline's inactive-region scan so
 * the two agree. The pure decision function {@link computeDimmedRanges} is exported and unit-tested
 * directly.
 */

/** CSS class applied to a line range inside an inactive conditional branch. */
export const DIMMED_CONDITIONAL_CLASS = 'cm-ad-conditional-dimmed';

const EMPTY_SCOPE: ReadonlyMap<string, string> = new Map();

/** A half-open character range covering the content of a line inside an inactive conditional branch. */
export interface DimmedRange {
  /** Document offset of the line's first character. */
  from: number;
  /** Document offset just past the line's last character (exclusive of the newline). */
  to: number;
}

/**
 * Compute the character ranges of every line that sits inside a conditional branch which resolves
 * INACTIVE for `scope`. A region is active only when every enclosing conditional evaluates true;
 * nesting compounds (an inner region inside an inactive outer region stays inactive regardless of its
 * own test). The directive lines themselves (`ifdef`/`endif`/…) are NOT dimmed — only the guarded
 * body content. Unbalanced `endif::[]` is tolerated (an empty stack pop is a no-op). Empty body lines
 * yield no zero-length range. Mirrors the outline's inactive-region scan so the two agree (FR-032).
 *
 * @param documentText - The open file's full text.
 * @param scope - The resolved attribute values (lowercase name → value) for the open file.
 * @returns The dimmed line ranges in document order.
 */
export function computeDimmedRanges(
  documentText: string,
  scope: ReadonlyMap<string, string> = EMPTY_SCOPE,
): DimmedRange[] {
  const ranges: DimmedRange[] = [];
  // The shared region stack — same authority the outline uses, so the two agree. A single-line
  // `ifdef::name[text]` content form is NOT a region opener, so it never dims the lines below it.
  const stack = new ConditionalRegionStack();
  let cursor = 0;
  for (const line of documentText.split('\n')) {
    // A directive line (region opener/closer) moves the stack and is itself never dimmed; a body line
    // inside an inactive branch (any enclosing region inactive) has its content dimmed.
    const kind = stack.applyLine(line, scope);
    if (kind === null && !stack.isActive() && line.length > 0) {
      ranges.push({ from: cursor, to: cursor + line.length });
    }
    cursor += line.length + 1;
  }
  return ranges;
}

const dimmedMark = Decoration.mark({ class: DIMMED_CONDITIONAL_CLASS });

function buildDecorations(view: EditorView, getScope: () => ReadonlyMap<string, string>): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of computeDimmedRanges(view.state.doc.toString(), getScope())) {
    builder.add(range.from, range.to, dimmedMark);
  }
  return builder.finish();
}

/**
 * CM6 extension that dims the content of inactive conditional branches in the open file (US12/FR-032).
 * `getScope` supplies the file's resolved cross-document attribute scope (lowercase name → value) from
 * the project symbol index; it is read lazily so {@link refreshCrossDocumentAttributesEffect}
 * re-evaluates the dimming once the controlling attributes change, without a document edit (FR-007a).
 *
 * @param getScope - Returns the open file's resolved cross-document attribute scope (default ∅).
 * @returns The conditional-dimming view plugin.
 */
export function asciidocConditionalDimming(
  getScope: () => ReadonlyMap<string, string> = () => EMPTY_SCOPE,
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getScope);
      }

      update(update: ViewUpdate) {
        // Re-evaluate on the shared cross-document refresh effect — dispatched when the resolved scope
        // changes without a document edit — since the dimming reads that same resolved scope and the
        // controlling attributes may have changed (FR-007a/FR-032).
        const refreshed = update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(refreshCrossDocumentAttributesEffect)),
        );
        // The dimming scans the whole document text, not the viewport, so a scroll never changes it —
        // recompute only on a document edit or the shared refresh effect (avoids a full-document
        // conditional scan on every scroll).
        if (update.docChanged || refreshed) {
          this.decorations = buildDecorations(update.view, getScope);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
