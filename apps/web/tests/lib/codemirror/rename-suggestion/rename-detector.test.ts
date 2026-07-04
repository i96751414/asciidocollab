import { EditorState } from '@codemirror/state';
import { definitionAtCursor } from '@/lib/codemirror/rename-suggestion/rename-detector';

/** Build a state whose cursor sits at the first occurrence of `caret` inside `doc` (caret stripped). */
function stateWithCaret(document: string): EditorState {
  const at = document.indexOf('|');
  if (at === -1) throw new Error('test doc must contain a | caret marker');
  const text = document.slice(0, at) + document.slice(at + 1);
  return EditorState.create({ doc: text, selection: { anchor: at } });
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
});
