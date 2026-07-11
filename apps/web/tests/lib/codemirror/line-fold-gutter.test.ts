/* @jest-environment jsdom */
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { foldService, foldedRanges } from '@codemirror/language';
import { lineNumbersWithFold, findFoldOnLine } from '@/lib/codemirror/line-fold-gutter';

// A fold service that makes the first line foldable, collapsing from its end to the end of the doc.
const foldFirstLine = foldService.of((state, lineStart, lineEnd) =>
  state.doc.lineAt(lineStart).number === 1 ? { from: lineEnd, to: state.doc.length } : null,
);

function mount(text: string, foldable = true) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    state: EditorState.create({ doc: text, extensions: foldable ? [lineNumbersWithFold(), foldFirstLine] : [lineNumbersWithFold()] }),
    parent,
  });
  return { view, parent };
}

function foldedCount(view: EditorView): number {
  let count = 0;
  foldedRanges(view.state).between(0, view.state.doc.length, () => {
    count += 1;
  });
  return count;
}

describe('lineNumbersWithFold', () => {
  test('renders one numbered cell per line', () => {
    const { view, parent } = mount('line one\nline two\nline three');
    expect([...view.dom.querySelectorAll('.cm-lnfold-num')].map((n) => n.textContent)).toEqual(['1', '2', '3']);
    view.destroy();
    parent.remove();
  });

  test('marks a foldable line with a fold chevron; a plain line has none', () => {
    const { view, parent } = mount('= Title\nbody line\nmore body');
    const cells = view.dom.querySelectorAll('.cm-lnfold');
    expect(cells[0].classList.contains('cm-lnfold-foldable')).toBe(true);
    expect(cells[0].querySelector('.cm-lnfold-chev[title="Fold line"]')).not.toBeNull();
    // Line 2 is not foldable → just a number, no chevron.
    expect(cells[1].classList.contains('cm-lnfold-foldable')).toBe(false);
    expect(cells[1].querySelector('.cm-lnfold-chev')).toBeNull();
    view.destroy();
    parent.remove();
  });

  test('clicking a foldable cell folds it, and clicking again unfolds it', () => {
    const { view, parent } = mount('= Title\nbody line\nmore body');
    const cell = () => view.dom.querySelector('.cm-lnfold-gutter .cm-gutterElement')!;
    // jsdom maps a synthetic gutter event to line 1 — the foldable line.
    cell().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(foldedCount(view)).toBe(1);
    // Folded line now offers "Unfold line".
    expect(view.dom.querySelector('.cm-lnfold-folded .cm-lnfold-chev[title="Unfold line"]')).not.toBeNull();
    cell().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(foldedCount(view)).toBe(0);
    view.destroy();
    parent.remove();
  });

  test('clicking a non-foldable line does nothing', () => {
    const { view, parent } = mount('plain one\nplain two', false);
    view.dom.querySelector('.cm-lnfold-gutter .cm-gutterElement')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(foldedCount(view)).toBe(0);
    view.destroy();
    parent.remove();
  });
});

describe('findFoldOnLine', () => {
  test('returns null when the line carries no fold', () => {
    const state = EditorState.create({ doc: 'a\nb', extensions: [lineNumbersWithFold()] });
    expect(findFoldOnLine(state, 0, 1)).toBeNull();
  });

  test('returns the folded range once a line is folded', () => {
    const { view, parent } = mount('= Title\nbody line\nmore body');
    view.dom.querySelector('.cm-lnfold-gutter .cm-gutterElement')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const line1 = view.state.doc.line(1);
    expect(findFoldOnLine(view.state, line1.from, line1.to)).not.toBeNull();
    view.destroy();
    parent.remove();
  });
});
