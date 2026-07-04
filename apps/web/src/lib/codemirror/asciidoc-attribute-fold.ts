import {
  ViewPlugin,
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state';

/**
 * `{attr}` collapse-to-value. Renders a resolved attribute
 * reference (`{version}`) as its value via a **replace decoration** — the
 * document text is never changed (Constitution VII). References resolve
 * against attributes defined *earlier* in the document (document-order, like
 * Asciidoctor) seeded with the attributes the open file inherits from the
 * documents that include it; unknown/forward references are left
 * as-is. Attribute names are matched case-insensitively, as Asciidoctor does.
 */

const ATTR_DEF_RE = /^:([A-Za-z0-9][\w-]*)(!?):(?:\s+(.*))?$/;
const ATTR_REF_RE = /\{([A-Za-z0-9][\w-]*)\}/g;
// Inline attribute assignment in body text: `{set:name:value}` (set) or `{set:name!}` (unset). A set
// defines/overrides the attribute from this point onward; an unset removes it — exactly like a
// `:name:` / `:name!:` entry, so an own `{set:}`-defined `{name}` later folds to its value.
const INLINE_SET_RE = /\{set:([A-Za-z0-9][\w-]*)(?:!|:([^}]*))\}/g;
const NO_INHERITED_ATTRIBUTES: ReadonlyMap<string, string> = new Map();

/**
 * Dispatch this effect to recompute the collapsed `{attr}` values when nothing in the document
 * changed — such as when the project symbol index resolves new inherited attributes from a parent
 * file (an async load, or a main-file reconfiguration), so cross-document references collapse once
 * their values become available.
 */
export const refreshAttributeFoldEffect = StateEffect.define<void>();

/** A `{attr}` reference and the value it collapses to for display. */
export interface AttributeReplacement {
  /** Document offset of the `{`. */
  from: number;
  /** Document offset just past the `}`. */
  to: number;
  /** Resolved attribute value to display. */
  value: string;
}

/** Resolve `{ref}`s inside an attribute value against the values defined so far (case-insensitive). */
function substitute(value: string, defined: Map<string, string>): string {
  return value.replaceAll(ATTR_REF_RE, (whole, name: string) => defined.get(name.toLowerCase()) ?? whole);
}

/**
 * Compute the collapse-to-value replacements for a document: every `{name}` reference whose
 * attribute is in scope — defined on an earlier line, or inherited from a parent (including)
 * document. An in-file definition (or unset) overrides the inherited value from its line onward.
 *
 * @param documentText - The open file's full text.
 * @param inherited - Attributes (lowercase name → value) inherited from the documents that include
 *   this file; these seed the in-scope set so cross-document references collapse. Defaults to none.
 * @returns The replacements, each with the raw reference's offsets and its resolved value.
 */
export function computeAttributeReplacements(
  documentText: string,
  inherited: ReadonlyMap<string, string> = NO_INHERITED_ATTRIBUTES,
): AttributeReplacement[] {
  // Attribute names are case-insensitive in Asciidoctor; normalise keys to lowercase throughout.
  const defined = new Map<string, string>();
  for (const [name, value] of inherited) defined.set(name.toLowerCase(), value);
  const replacements: AttributeReplacement[] = [];
  let cursor = 0;

  for (const line of documentText.split('\n')) {
    const definition = ATTR_DEF_RE.exec(line);
    if (definition) {
      const [, name, bang, rawValue] = definition;
      const key = name.toLowerCase();
      if (bang === '!') defined.delete(key);
      else defined.set(key, substitute(rawValue ?? '', defined));
      cursor += line.length + 1;
      continue;
    }

    // Inline `{set:}` assignments and `{ref}` references interleave on the same line, so process them
    // in column order: a `{set:name:value}` to the LEFT of a `{name}` reference defines it in time
    // for that reference, mirroring Asciidoctor's left-to-right inline substitution. The
    // `{set:...}` token itself is never a foldable reference (ATTR_REF_RE cannot match it).
    const sets = [...line.matchAll(INLINE_SET_RE)].map((m) => ({
      index: m.index ?? 0,
      name: m[1].toLowerCase(),
      value: m[2],
    }));
    const references = [...line.matchAll(ATTR_REF_RE)].map((m) => ({
      index: m.index ?? 0,
      length: m[0].length,
      name: m[1].toLowerCase(),
    }));
    const events = [...sets.map((s) => ({ kind: 'set' as const, ...s })), ...references.map((r) => ({ kind: 'ref' as const, ...r }))]
      .toSorted((a, b) => a.index - b.index);
    for (const event of events) {
      if (event.kind === 'set') {
        if (event.value === undefined) defined.delete(event.name);
        else defined.set(event.name, substitute(event.value, defined));
        continue;
      }
      const value = defined.get(event.name);
      if (value === undefined) continue;
      const from = cursor + event.index;
      replacements.push({ from, to: from + event.length, value });
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

  /**
   * Let the editor handle events that occur on the widget. The base widget ignores them by default,
   * which makes CodeMirror discard a selection change landing inside the widget — so a mouse click
   * would never move the cursor onto the collapsed reference and never reveal its raw source (only
   * arrow-key movement, handled by the keymap, would). Returning false lets a click place the cursor
   * on the reference, which {@link buildDecorations} then reveals.
   */
  ignoreEvent(): boolean {
    return false;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-ad-attr-value';
    span.textContent = this.value;
    span.title = 'Resolved attribute value (source unchanged)';
    return span;
  }
}

function buildDecorations(view: EditorView, getInheritedAttributes: () => ReadonlyMap<string, string>): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from: selectionFrom, to: selectionTo } = view.state.selection.main;
  for (const replacement of computeAttributeReplacements(view.state.doc.toString(), getInheritedAttributes())) {
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

/**
 * CM6 extension rendering resolved `{attr}` references as their value (display only). The accessor
 * supplies the attributes the open file inherits from the documents that include it, so a reference
 * to a cross-document attribute collapses too; it is read lazily so a {@link
 * refreshAttributeFoldEffect} re-evaluates once the symbol index resolves those values.
 *
 * @param getInheritedAttributes - Returns the open file's inherited attribute map (default none).
 * @returns The attribute collapse-to-value view plugin.
 */
export function asciidocAttributeFold(
  getInheritedAttributes: () => ReadonlyMap<string, string> = () => NO_INHERITED_ATTRIBUTES,
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getInheritedAttributes);
      }

      update(update: ViewUpdate) {
        const refreshed = update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(refreshAttributeFoldEffect)),
        );
        if (update.docChanged || update.selectionSet || update.viewportChanged || refreshed) {
          this.decorations = buildDecorations(update.view, getInheritedAttributes);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
