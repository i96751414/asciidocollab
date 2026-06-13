import {
  ViewPlugin,
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

/**
 * `{attr}` collapse-to-value (US4, FR-057). Renders a resolved attribute
 * reference (`{version}`) as its value via a **replace decoration** — the
 * document text is never changed (Constitution VII; FR-015). Only references to
 * attributes defined *earlier* in the document (document-order, like
 * Asciidoctor) are collapsed; unknown/forward references are left as-is.
 */

const ATTR_DEF_RE = /^:([A-Za-z0-9][\w-]*)(!?):(?:\s+(.*))?$/;
const ATTR_REF_RE = /\{([A-Za-z0-9][\w-]*)\}/g;

/** A `{attr}` reference and the value it collapses to for display. */
export interface AttributeReplacement {
  /** Document offset of the `{`. */
  from: number;
  /** Document offset just past the `}`. */
  to: number;
  /** Resolved attribute value to display. */
  value: string;
}

/** Resolve `{ref}`s inside an attribute value against the values defined so far. */
function substitute(value: string, defined: Map<string, string>): string {
  return value.replaceAll(ATTR_REF_RE, (whole, name: string) => defined.get(name) ?? whole);
}

/**
 * Compute the collapse-to-value replacements for a document: every `{name}`
 * reference whose attribute was defined on an earlier line.
 */
export function computeAttributeReplacements(documentText: string): AttributeReplacement[] {
  const defined = new Map<string, string>();
  const replacements: AttributeReplacement[] = [];
  let cursor = 0;

  for (const line of documentText.split('\n')) {
    const definition = ATTR_DEF_RE.exec(line);
    if (definition) {
      const [, name, bang, rawValue] = definition;
      if (bang === '!') defined.delete(name);
      else defined.set(name, substitute(rawValue ?? '', defined));
      cursor += line.length + 1;
      continue;
    }

    for (const match of line.matchAll(ATTR_REF_RE)) {
      const name = match[1];
      const value = defined.get(name);
      if (value === undefined) continue;
      const from = cursor + (match.index ?? 0);
      replacements.push({ from, to: from + match[0].length, value });
    }
    cursor += line.length + 1;
  }

  return replacements;
}

class AttributeValueWidget extends WidgetType {
  constructor(private readonly value: string) {
    super();
  }

  eq(other: AttributeValueWidget): boolean {
    return other.value === this.value;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-ad-attr-value';
    span.textContent = this.value;
    span.title = 'Resolved attribute value (source unchanged)';
    return span;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from: selectionFrom, to: selectionTo } = view.state.selection.main;
  for (const replacement of computeAttributeReplacements(view.state.doc.toString())) {
    // Reveal the raw reference when the selection/cursor overlaps it, so editing works.
    if (selectionFrom <= replacement.to && selectionTo >= replacement.from) continue;
    builder.add(
      replacement.from,
      replacement.to,
      Decoration.replace({ widget: new AttributeValueWidget(replacement.value) }),
    );
  }
  return builder.finish();
}

/** CM6 extension rendering resolved `{attr}` references as their value (display only). */
export const asciidocAttributeFold = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
