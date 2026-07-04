import { EditorState } from '@codemirror/state';
import { definitionAtCursor } from '@/lib/codemirror/rename-suggestion/rename-detector';
import {
  inheritedAttributesField,
  setInheritedAttributesEffect,
} from '@/lib/codemirror/inherited-attributes-field';

/** Build a state whose cursor sits at the first occurrence of `caret` inside `doc` (caret stripped). */
function stateWithCaret(document: string): EditorState {
  const at = document.indexOf('|');
  if (at === -1) throw new Error('test doc must contain a | caret marker');
  const text = document.slice(0, at) + document.slice(at + 1);
  return EditorState.create({ doc: text, selection: { anchor: at } });
}

/** Like {@link stateWithCaret} but with the rename seed field installed and populated (inherited attrs). */
function stateWithSeed(document: string, seed: Map<string, string>): EditorState {
  const at = document.indexOf('|');
  if (at === -1) throw new Error('test doc must contain a | caret marker');
  const text = document.slice(0, at) + document.slice(at + 1);
  const base = EditorState.create({ doc: text, selection: { anchor: at }, extensions: [inheritedAttributesField] });
  return base.update({ effects: setInheritedAttributesEffect.of(seed) }).state;
}

describe('definitionAtCursor', () => {
  test('detects an attribute definition with the cursor inside the name', () => {
    const result = definitionAtCursor(stateWithCaret(':product-|name: Acme\n'));
    expect(result).toEqual({ kind: 'attribute', name: 'product-name', range: { from: 0, to: 14 } });
  });

  test('detects an unset attribute definition (:name!:)', () => {
    const result = definitionAtCursor(stateWithCaret(':fea|ture!:\n'));
    expect(result).toMatchObject({ kind: 'attribute', name: 'feature' });
  });

  test('detects a [[id]] block anchor definition', () => {
    const result = definitionAtCursor(stateWithCaret('[[install-|guide]]\n== Setup\n'));
    expect(result).toMatchObject({ kind: 'anchor', name: 'install-guide' });
  });

  test('detects a [#id] anchor definition', () => {
    const result = definitionAtCursor(stateWithCaret('[#install-|guide]\n'));
    expect(result).toMatchObject({ kind: 'anchor', name: 'install-guide' });
  });

  test('detects an anchor:id[] macro definition', () => {
    const result = definitionAtCursor(stateWithCaret('anchor:install-|guide[]\n'));
    expect(result).toMatchObject({ kind: 'anchor', name: 'install-guide' });
  });

  test('returns null on an attribute REFERENCE (not a definition site)', () => {
    expect(definitionAtCursor(stateWithCaret('See {product-|name} for details.\n'))).toBeNull();
  });

  test('detects an inline {set:name:value} attribute definition', () => {
    const result = definitionAtCursor(stateWithCaret('{set:my|var:value}\n'));
    expect(result).toMatchObject({ kind: 'attribute', name: 'myvar' });
  });

  test('detects an inline {set:name!} unset definition', () => {
    expect(definitionAtCursor(stateWithCaret('{set:fl|ag!}\n'))).toMatchObject({ kind: 'attribute', name: 'flag' });
  });

  test('returns null when the cursor is on the VALUE of {set:name:value} (not renaming the name)', () => {
    expect(definitionAtCursor(stateWithCaret('{set:myvar:va|lue}\n'))).toBeNull();
  });

  test('returns null on an xref reference', () => {
    expect(definitionAtCursor(stateWithCaret('See <<install-|guide>>.\n'))).toBeNull();
  });

  test('returns null when the cursor is not on any symbol', () => {
    expect(definitionAtCursor(stateWithCaret('Just some | prose here.\n'))).toBeNull();
  });

  test('returns null when the cursor is on the line but outside the definition token', () => {
    expect(definitionAtCursor(stateWithCaret(':name: value here |end\n'))).toBeNull();
  });

  test('detects a section heading via its auto-generated id', () => {
    const result = definitionAtCursor(stateWithCaret('== Install |Guide\n\nbody\n'));
    expect(result).toMatchObject({ kind: 'heading', name: '_install_guide' });
  });

  test('ignores a heading that has an explicit id (its derived id is not the target)', () => {
    expect(definitionAtCursor(stateWithCaret('[#custom]\n== Install |Guide\n'))).toBeNull();
  });

  test('ignores the level-0 document title', () => {
    expect(definitionAtCursor(stateWithCaret('= Document |Title\n'))).toBeNull();
  });

  test('ignores a "== Foo" line absorbed into a preceding paragraph (defines no section id)', () => {
    // Prose with no blank line before `== Setup` opens a paragraph that absorbs it, so Asciidoctor
    // renders it as body text, not a section — it must not be offered as a renameable heading.
    expect(definitionAtCursor(stateWithCaret('Some prose here.\n== Se|tup\n'))).toBeNull();
  });

  test("derives the heading id with the file's own idprefix/idseparator", () => {
    const result = definitionAtCursor(stateWithCaret(':idprefix: sect_\n:idseparator: -\n\n== Install |Guide\n'));
    expect(result).toMatchObject({ kind: 'heading', name: 'sect_install-guide' });
  });

  test('offers no heading rename when sectids is off (the heading has no auto id)', () => {
    expect(definitionAtCursor(stateWithCaret(':sectids!:\n\n== Install |Guide\n'))).toBeNull();
  });

  test('derives the heading id with an idprefix/idseparator INHERITED from the seed (parent-set)', () => {
    // The open buffer sets neither attribute; they come from an including parent via the seed. The
    // derived id must match what the server (seeded the same way) and preview produce — not the
    // default `_install_guide` — so the rename targets the correct cross-document id.
    const seed = new Map([['idprefix', 'sect_'], ['idseparator', '-']]);
    const result = definitionAtCursor(stateWithSeed('== Install |Guide\n', seed));
    expect(result).toMatchObject({ kind: 'heading', name: 'sect_install-guide' });
  });
});
