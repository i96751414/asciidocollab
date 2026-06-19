import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state';

/**
 * Cross-document attribute highlighting (US6, FR-020/021).
 *
 * The grammar already tokenises `{name}` references (`AttributeReference`) and `:name:` definitions
 * (`AttributeEntry`) and the theme colours both. What it CANNOT know is whether a `{name}` reference
 * names an attribute defined SOMEWHERE in the include tree — a parent that includes this file
 * (FR-020), or a sub-document this file includes (FR-021). That cross-document knowledge comes from
 * the project symbol index, which is editor presentation state, not grammar.
 *
 * This module marks each `{name}` whose (case-insensitive) name is present in the set of attributes
 * KNOWN ANYWHERE IN THE TREE — the index's project-wide `attributes` view (every file's net
 * definitions unioned), NOT the position-aware resolved scope. This is deliberate and broader than
 * resolution: an attribute defined only in a descendant is "known" (FR-021) and so highlighted, even
 * though it has no resolved VALUE at a reference above its definition — which is why the `{attr}`
 * collapse-to-value fold and the outline use the position-resolved scope instead, and a `{name}` can
 * legitimately be highlighted-known yet not collapse to a value. (The symbol-index test
 * "project-wide `attributes` include definitions from INCLUDED files" pins this divergence.) The
 * known-names set is supplied lazily through an accessor so the decoration re-evaluates live as the
 * index rebuilds (FR-007a) — without a document edit — via {@link refreshCrossDocumentAttributesEffect}.
 */

/** CSS class flagging a `{name}` reference that resolves in the file's cross-document scope. */
export const KNOWN_CROSS_DOC_ATTRIBUTE_CLASS = 'cm-ad-attr-known';

const ATTR_DEF_RE = /^:[A-Za-z0-9][\w-]*!?:/;
const ATTR_REF_RE = /\{([A-Za-z0-9][\w-]*)\}/g;
const NO_KNOWN_NAMES: ReadonlySet<string> = new Set();

/**
 * Dispatch this effect to re-evaluate the known-vs-unknown marks when nothing in the document
 * changed — such as when the project symbol index resolves new cross-document attributes from a
 * parent/included file (an async load, or a main-file reconfiguration).
 */
export const refreshCrossDocumentAttributesEffect = StateEffect.define<void>();

/** A `{name}` reference range that resolves in the cross-document scope. */
export interface KnownAttributeMark {
  /** Document offset of the `{`. */
  from: number;
  /** Document offset just past the `}`. */
  to: number;
}

/**
 * Compute the ranges of every `{name}` reference whose attribute name is KNOWN ANYWHERE in the
 * include tree. Attribute-definition lines (`:name:` / `:name!:`) are skipped so an entry is never
 * mistaken for a reference. Names are matched case-insensitively (Asciidoctor semantics).
 *
 * @param documentText - The open file's full text.
 * @param knownNames - The names (lowercase) defined anywhere in the include tree (the symbol index's
 *   project-wide `attributes` view, FR-020/021) — broader than the position-resolved value scope.
 * @returns The known-reference ranges in document order.
 */
export function computeKnownAttributeMarks(
  documentText: string,
  knownNames: ReadonlySet<string> = NO_KNOWN_NAMES,
): KnownAttributeMark[] {
  if (knownNames.size === 0) return [];
  const marks: KnownAttributeMark[] = [];
  let cursor = 0;
  for (const line of documentText.split('\n')) {
    if (!ATTR_DEF_RE.test(line)) {
      for (const match of line.matchAll(ATTR_REF_RE)) {
        if (!knownNames.has(match[1].toLowerCase())) continue;
        const from = cursor + (match.index ?? 0);
        marks.push({ from, to: from + match[0].length });
      }
    }
    cursor += line.length + 1;
  }
  return marks;
}

const knownAttributeMark = Decoration.mark({ class: KNOWN_CROSS_DOC_ATTRIBUTE_CLASS });

function buildDecorations(view: EditorView, getKnownNames: () => ReadonlySet<string>): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const mark of computeKnownAttributeMarks(view.state.doc.toString(), getKnownNames())) {
    builder.add(mark.from, mark.to, knownAttributeMark);
  }
  return builder.finish();
}

/**
 * CM6 extension marking each `{name}` reference whose name is known anywhere in the include tree
 * (US6/FR-020/021). `getKnownNames` supplies the project-wide known-attribute names (lowercase) from
 * the symbol index — the broad "defined anywhere" set, not the position-resolved scope; it is read
 * lazily so a {@link refreshCrossDocumentAttributesEffect} re-evaluates the marks once the index
 * rebuilds, without a document edit (FR-007a).
 *
 * @param getKnownNames - Returns the project-wide known cross-document attribute names (default ∅).
 * @returns The cross-document attribute highlight view plugin.
 */
export function asciidocCrossDocumentAttributes(
  getKnownNames: () => ReadonlySet<string> = () => NO_KNOWN_NAMES,
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getKnownNames);
      }

      update(update: ViewUpdate) {
        const refreshed = update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(refreshCrossDocumentAttributesEffect)),
        );
        // The marks scan the whole document text, not the viewport, so a scroll never changes them —
        // recompute only on a document edit or the cross-document refresh effect (avoids a full
        // split+regex scan on every scroll).
        if (update.docChanged || refreshed) {
          this.decorations = buildDecorations(update.view, getKnownNames);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
