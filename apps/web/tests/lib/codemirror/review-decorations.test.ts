/* @jest-environment jsdom */
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  computeReviewDecorationRanges,
  reviewDecorations,
  reviewIdAtLine,
  setReviewRangesEffect,
  REVIEW_HIGHLIGHT_CLASS,
  REVIEW_HIGHLIGHT_ACTIVE_CLASS,
  REVIEW_HIGHLIGHT_FLASH_CLASS,
  REVIEW_ADD_COMMENT_CLASS,
  REVIEW_GUTTER_SELECTED_CLASS,
  type ReviewAnchorRange,
} from '@/lib/codemirror/review-decorations';

/**
 * Pure `computeReviewDecorationRanges` tests (feature 038, T013): the active item gets the ACTIVE
 * class and every other item the resting class, and the output is sorted by (from, to).
 */

describe('computeReviewDecorationRanges', () => {
  const items: ReviewAnchorRange[] = [
    { id: 'b', from: 20, to: 25 },
    { id: 'a', from: 5, to: 10 },
    { id: 'c', from: 5, to: 8 },
  ];

  test('assigns the resting class to every item when none is active', () => {
    const ranges = computeReviewDecorationRanges(items, null);
    expect(ranges.every((r) => r.cls === REVIEW_HIGHLIGHT_CLASS)).toBe(true);
  });

  test('assigns the active class to only the active item, resting to the rest', () => {
    const ranges = computeReviewDecorationRanges(items, 'a');
    const byId = Object.fromEntries(ranges.map((r) => [r.id, r.cls]));
    expect(byId.a).toBe(REVIEW_HIGHLIGHT_ACTIVE_CLASS);
    expect(byId.b).toBe(REVIEW_HIGHLIGHT_CLASS);
    expect(byId.c).toBe(REVIEW_HIGHLIGHT_CLASS);
  });

  test('sorts by (from, to)', () => {
    const ranges = computeReviewDecorationRanges(items, null);
    expect(ranges.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  test('preserves each item id and offsets on the output', () => {
    const ranges = computeReviewDecorationRanges([{ id: 'x', from: 1, to: 4 }], 'x');
    expect(ranges).toEqual([
      { id: 'x', from: 1, to: 4, cls: REVIEW_HIGHLIGHT_ACTIVE_CLASS },
    ]);
  });

  test('an unknown active id leaves every item resting', () => {
    const ranges = computeReviewDecorationRanges(items, 'does-not-exist');
    expect(ranges.every((r) => r.cls === REVIEW_HIGHLIGHT_CLASS)).toBe(true);
  });

  test('adds the one-shot flash class to the navigated-to item, alongside its highlight class', () => {
    const ranges = computeReviewDecorationRanges(items, 'a', 'a');
    const byId = Object.fromEntries(ranges.map((r) => [r.id, r.cls]));
    // The active + flashed item carries both classes; others stay resting with no flash.
    expect(byId.a.split(' ')).toEqual(
      expect.arrayContaining([REVIEW_HIGHLIGHT_ACTIVE_CLASS, REVIEW_HIGHLIGHT_FLASH_CLASS]),
    );
    expect(byId.b).toBe(REVIEW_HIGHLIGHT_CLASS);
  });

  test('a passage can flash without being the active one', () => {
    const ranges = computeReviewDecorationRanges(items, null, 'b');
    const byId = Object.fromEntries(ranges.map((r) => [r.id, r.cls]));
    expect(byId.b.split(' ')).toEqual([REVIEW_HIGHLIGHT_CLASS, REVIEW_HIGHLIGHT_FLASH_CLASS]);
    expect(byId.a).toBe(REVIEW_HIGHLIGHT_CLASS);
  });
});

describe('reviewIdAtLine', () => {
  // doc lines: 1="line one" [0-8], 2="line two" [9-17], 3="line three" [18-28].
  const content = 'line one\nline two\nline three';
  function stateWith(ranges: ReviewAnchorRange[]): EditorState {
    const state = EditorState.create({ doc: content, extensions: [reviewDecorations()] });
    return state.update({ effects: setReviewRangesEffect.of(ranges) }).state;
  }

  test('maps a line to the review id of a range starting on it', () => {
    const state = stateWith([{ id: 'r1', from: 10, to: 14 }]); // on line 2
    expect(reviewIdAtLine(state, 12)).toBe('r1'); // any offset within line 2
    expect(reviewIdAtLine(state, 9)).toBe('r1'); // line-start offset
  });

  test('returns null for a line with no review range', () => {
    const state = stateWith([{ id: 'r1', from: 10, to: 14 }]);
    expect(reviewIdAtLine(state, 2)).toBeNull(); // line 1
  });

  test('ignores a collapsed (deleted-passage) range', () => {
    const state = stateWith([{ id: 'gone', from: 10, to: 10 }]);
    expect(reviewIdAtLine(state, 12)).toBeNull();
  });
});

function mountAddCommentEditor(getOnComment: () => ((from: number, to: number) => void) | null) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: 'hello world\nsecond line',
      extensions: [reviewDecorations(() => null, getOnComment)],
    }),
    parent,
  });
  return { view, parent };
}

describe('add-comment gutter affordance', () => {
  const mount = mountAddCommentEditor;

  test('renders the add-comment icon on each line while a comment handler is available', () => {
    const { view, parent } = mount(() => jest.fn());
    const affordances = view.dom.querySelectorAll(`.${REVIEW_ADD_COMMENT_CLASS}`);
    expect(affordances.length).toBeGreaterThan(0);
    // The glyph is an SVG (lucide message-square-plus), not a bare "+".
    expect(affordances[0].querySelector('svg')).not.toBeNull();
    view.destroy();
    parent.remove();
  });

  test('renders no affordance when no comment handler is available', () => {
    const { view, parent } = mount(() => null);
    expect(view.dom.querySelectorAll(`.${REVIEW_ADD_COMMENT_CLASS}`).length).toBe(0);
    view.destroy();
    parent.remove();
  });

  test('marks the gutter of a line the selection overlaps as selected', () => {
    const { view, parent } = mount(() => jest.fn());
    // Select within line 1 ("hello world" is offsets 0–11).
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    expect(view.dom.querySelector(`.${REVIEW_GUTTER_SELECTED_CLASS}`)).not.toBeNull();
    view.destroy();
    parent.remove();
  });

  test('clicking the "+" comments the selection when the line overlaps it', () => {
    const onComment = jest.fn();
    const { view, parent } = mount(() => onComment);
    view.dispatch({ selection: { anchor: 0, head: 5 } }); // line 1
    // jsdom maps a synthetic gutter event to line 1, so target line 1's affordance.
    const plus = view.dom.querySelector<HTMLElement>(`.${REVIEW_ADD_COMMENT_CLASS}`);
    expect(plus).not.toBeNull();
    plus!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onComment).toHaveBeenCalledWith(0, 5);
    view.destroy();
    parent.remove();
  });

  test('clicking the "+" comments the whole line when the selection is collapsed', () => {
    const onComment = jest.fn();
    const { view, parent } = mount(() => onComment);
    view.dispatch({ selection: { anchor: 3, head: 3 } }); // collapsed caret on line 1
    const plus = view.dom.querySelector<HTMLElement>(`.${REVIEW_ADD_COMMENT_CLASS}`);
    plus!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    // Line 1 "hello world" spans offsets 0–11.
    expect(onComment).toHaveBeenCalledWith(0, 11);
    view.destroy();
    parent.remove();
  });

  test('a gutter mousedown that is not on the "+" does not start a comment', () => {
    const onComment = jest.fn();
    const { view, parent } = mount(() => onComment);
    view.dom.querySelector('.cm-review-gutter')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onComment).not.toHaveBeenCalled();
    view.destroy();
    parent.remove();
  });

  test('a gutter mousedown is inert (no throw) when no comment handler is available', () => {
    const { view, parent } = mount(() => null);
    expect(() =>
      view.dom.querySelector('.cm-review-gutter')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
    ).not.toThrow();
    view.destroy();
    parent.remove();
  });
});

function mountWithThread(
  getOnComment: () => ((from: number, to: number) => void) | null,
  getOnActivate: () => ((id: string) => void) | null,
) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: 'hello world\nsecond line',
      extensions: [reviewDecorations(() => null, getOnComment, getOnActivate)],
    }),
    parent,
  });
  // A resolved review range on line 1 so a dot renders and reviewIdAtLine resolves to its id.
  view.dispatch({ effects: setReviewRangesEffect.of([{ id: 'thread-1', from: 0, to: 5 }]) });
  return { view, parent };
}

describe('existing-thread dot activation', () => {
  test("clicking a line's existing-thread dot opens its thread and does not start a comment", () => {
    const onComment = jest.fn();
    const onActivate = jest.fn();
    const { view, parent } = mountWithThread(() => onComment, () => onActivate);
    const dot = view.dom.querySelector('.cm-review-gutter-marker');
    expect(dot).not.toBeNull();
    dot!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onActivate).toHaveBeenCalledWith('thread-1');
    expect(onComment).not.toHaveBeenCalled();
    view.destroy();
    parent.remove();
  });

  test('a dot click is inert (no throw, no comment) when no activate handler is wired', () => {
    const onComment = jest.fn();
    const { view, parent } = mountWithThread(() => onComment, () => null);
    const dot = view.dom.querySelector('.cm-review-gutter-marker');
    expect(() => dot!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))).not.toThrow();
    expect(onComment).not.toHaveBeenCalled();
    view.destroy();
    parent.remove();
  });
});
