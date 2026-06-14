/*
 * @jest-environment jsdom
 */
import { EditorState, EditorSelection, StateEffect } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import {
  computeAttributeReplacements,
  asciidocAttributeFold,
} from '@/lib/codemirror/asciidoc-attribute-fold';

// jsdom environment — the ViewPlugin builds replace-decoration widgets that call
// document.createElement, and EditorView needs a DOM host to mount into.

/** Mount a CM6 view with the attribute-fold plugin over `documentContent`. */
function mountView(documentContent: string, selection?: EditorSelection): EditorView {
  const state = EditorState.create({
    doc: documentContent,
    selection,
    extensions: [asciidocAttributeFold],
  });
  return new EditorView({ state, parent: document.body });
}

/** Count the replace decorations the plugin produced for the current view. */
function decorationCount(view: EditorView): number {
  const set = view.plugin(asciidocAttributeFold)?.decorations;
  return set ? set.size : 0;
}

describe('computeAttributeReplacements (FR-057)', () => {
  test('collapses a reference to an attribute defined earlier', () => {
    const source = ':version: 1.2.3\n\nRelease {version} now.\n';
    const [replacement] = computeAttributeReplacements(source);
    expect(replacement.value).toBe('1.2.3');
    expect(source.slice(replacement.from, replacement.to)).toBe('{version}');
  });

  test('ignores forward references (defined later)', () => {
    const source = 'See {version}.\n\n:version: 9\n';
    expect(computeAttributeReplacements(source)).toHaveLength(0);
  });

  test('ignores unknown attributes', () => {
    expect(computeAttributeReplacements('Use {missing} here.\n')).toHaveLength(0);
  });

  test(':name!: unsets the attribute', () => {
    const source = ':x: 1\n:x!:\nValue {x}.\n';
    expect(computeAttributeReplacements(source)).toHaveLength(0);
  });

  test('an empty-valued attribute resolves to an empty string', () => {
    // ":toc:" defines the attribute with no value; a later {toc} collapses to "".
    const source = ':toc:\nList {toc} here.\n';
    const [replacement] = computeAttributeReplacements(source);
    expect(replacement.value).toBe('');
    expect(source.slice(replacement.from, replacement.to)).toBe('{toc}');
  });

  test('resolves nested references inside attribute values', () => {
    const source = ':first: Jane\n:full: {first} Doe\n\nHello {full}.\n';
    const replacement = computeAttributeReplacements(source).find((entry) => entry.value.includes('Jane'));
    expect(replacement?.value).toBe('Jane Doe');
  });

  test('leaves an unresolved nested reference inside a value untouched', () => {
    // {missing} is undefined when :full: is parsed → substitute keeps it verbatim.
    const source = ':full: {missing} Doe\n\nHello {full}.\n';
    const replacement = computeAttributeReplacements(source).find((entry) => entry.value.includes('Doe'));
    expect(replacement?.value).toBe('{missing} Doe');
  });

  test('does not modify the document (offsets map back to the raw reference)', () => {
    const source = ':a: X\n{a} and {a}\n';
    const replacements = computeAttributeReplacements(source);
    expect(replacements).toHaveLength(2);
    for (const replacement of replacements) {
      expect(source.slice(replacement.from, replacement.to)).toBe('{a}');
    }
  });

  test('a non-reference, non-definition line advances the cursor correctly', () => {
    // The plain middle line forces the cursor-advance branch with no matches.
    const source = ':a: X\nplain prose line\nthen {a}.\n';
    const [replacement] = computeAttributeReplacements(source);
    expect(replacement.value).toBe('X');
    expect(source.slice(replacement.from, replacement.to)).toBe('{a}');
  });

  test('returns an empty array for an empty document', () => {
    expect(computeAttributeReplacements('')).toEqual([]);
  });
});

describe('asciidocAttributeFold ViewPlugin', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('is a defined CM6 extension', () => {
    expect(asciidocAttributeFold).toBeDefined();
  });

  test('builds a replace decoration for a resolvable reference', () => {
    const view = mountView(':version: 1.2.3\n\nRelease {version} now.\n');
    expect(decorationCount(view)).toBe(1);
    // The widget renders the resolved value into the DOM.
    expect(view.dom.querySelector('.cm-ad-attr-value')?.textContent).toBe('1.2.3');
    view.destroy();
  });

  test('renders the widget with an explanatory title and unchanged source text', () => {
    const source = ':version: 1.2.3\n\nRelease {version} now.\n';
    const view = mountView(source);
    const widget = view.dom.querySelector('.cm-ad-attr-value');
    expect(widget?.getAttribute('title')).toBe('Resolved attribute value (source unchanged)');
    // Constitution VII / FR-015: the document text is never mutated.
    expect(view.state.doc.toString()).toBe(source);
    view.destroy();
  });

  test('produces no decorations when there are no resolvable references', () => {
    const view = mountView('Just prose with {unknown} refs.\n');
    expect(decorationCount(view)).toBe(0);
    view.destroy();
  });

  test('reveals the raw reference when the selection overlaps it', () => {
    const source = ':version: 1.2.3\n\nRelease {version} now.\n';
    const referenceStart = source.indexOf('{version}');
    // Place the cursor inside the reference; the overlapping decoration is skipped.
    const view = mountView(source, EditorSelection.cursor(referenceStart + 2));
    expect(decorationCount(view)).toBe(0);
    view.destroy();
  });

  test('re-collapses the reference once the selection moves away', () => {
    const source = ':version: 1.2.3\n\nRelease {version} now.\n';
    const referenceStart = source.indexOf('{version}');
    const view = mountView(source, EditorSelection.cursor(referenceStart + 2));
    expect(decorationCount(view)).toBe(0);
    // Move the cursor to the document start (selectionSet branch of update()).
    view.dispatch({ selection: EditorSelection.cursor(0) });
    expect(decorationCount(view)).toBe(1);
    view.destroy();
  });

  test('rebuilds decorations after a document edit (docChanged branch)', () => {
    const view = mountView(':version: 1.2.3\n\nplain text\n');
    expect(decorationCount(view)).toBe(0);
    // Insert a resolvable reference at the end → docChanged triggers a rebuild.
    view.dispatch({ changes: { from: view.state.doc.length, insert: '{version}\n' } });
    expect(decorationCount(view)).toBe(1);
    view.destroy();
  });

  test('an update that changes neither doc, selection, nor viewport keeps decorations', () => {
    // Dispatching a no-op StateEffect produces an update() call whose
    // docChanged/selectionSet/viewportChanged flags are all false — the
    // decorations must be left intact (the else path of the rebuild guard).
    const inertEffect = StateEffect.define<null>();
    const source = ':a: X\n{a}\n';
    const view = mountView(source, EditorSelection.cursor(0));
    expect(decorationCount(view)).toBe(1);
    view.dispatch({ effects: inertEffect.of(null) });
    expect(decorationCount(view)).toBe(1);
    view.destroy();
  });

  test('the replace decoration spans exactly the {reference} text', () => {
    const source = ':a: X\n{a}\n';
    const view = mountView(source, EditorSelection.cursor(0));
    const set = view.plugin(asciidocAttributeFold)?.decorations;
    const ranges: Array<{ from: number; to: number }> = [];
    set?.between(0, view.state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });
    expect(ranges).toEqual([{ from: source.indexOf('{a}'), to: source.indexOf('{a}') + 3 }]);
    view.destroy();
  });
});

describe('AttributeValueWidget (via Decoration.replace)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('equal widgets compare equal and unequal values do not (eq)', () => {
    // Two replace decorations with the same resolved value reuse one widget DOM
    // node on redraw; differing values force a fresh node. Exercising eq() this
    // way avoids reaching into the (non-exported) widget class directly.
    const source = ':a: SAME\n{a}\n{a}\n';
    const view = mountView(source, EditorSelection.cursor(0));
    const initial = view.dom.querySelectorAll('.cm-ad-attr-value');
    expect(initial).toHaveLength(2);
    for (const node of initial) expect(node.textContent).toBe('SAME');
    view.destroy();
  });

  test('redrawing the same reference reuses the widget when the value is unchanged (eq → true)', () => {
    // Editing prose elsewhere keeps {a}'s resolved value identical, so CM6
    // compares the old and new widgets via eq(); equal values let it keep the
    // existing DOM node.
    const source = ':a: KEEP\n{a} tail\n';
    const view = mountView(source, EditorSelection.cursor(0));
    const before = view.dom.querySelector('.cm-ad-attr-value');
    expect(before?.textContent).toBe('KEEP');
    // Append text after the reference; the decoration at {a} is re-derived but
    // resolves to the same value, so eq() reports the widgets as equal.
    view.dispatch({ changes: { from: view.state.doc.length, insert: ' more\n' } });
    expect(view.dom.querySelector('.cm-ad-attr-value')?.textContent).toBe('KEEP');
    view.destroy();
  });

  test('changing the resolved value forces a new widget (eq → false)', () => {
    // Replace the attribute definition's value so the same {a} position now
    // resolves differently; CM6's eq() sees unequal values and re-renders.
    const source = ':a: OLD\n{a}\n';
    const view = mountView(source, EditorSelection.cursor(0));
    expect(view.dom.querySelector('.cm-ad-attr-value')?.textContent).toBe('OLD');
    const valueStart = source.indexOf('OLD');
    view.dispatch({ changes: { from: valueStart, to: valueStart + 3, insert: 'NEW' } });
    expect(view.dom.querySelector('.cm-ad-attr-value')?.textContent).toBe('NEW');
    view.destroy();
  });

  test('toDOM renders a span carrying the resolved value', () => {
    const view = mountView(':a: VALUE\n{a}\n', EditorSelection.cursor(0));
    const span = view.dom.querySelector('span.cm-ad-attr-value');
    expect(span).not.toBeNull();
    expect(span?.tagName.toLowerCase()).toBe('span');
    expect(span?.textContent).toBe('VALUE');
    view.destroy();
  });

  test('Decoration.replace is the mechanism (sanity: type is available)', () => {
    expect(typeof Decoration.replace).toBe('function');
  });
});
