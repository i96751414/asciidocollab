import { EditorState } from '@codemirror/state';
import {
  computeReviewDecorationRanges,
  reviewDecorations,
  reviewIdAtLine,
  setReviewRangesEffect,
  REVIEW_HIGHLIGHT_CLASS,
  REVIEW_HIGHLIGHT_ACTIVE_CLASS,
  REVIEW_HIGHLIGHT_FLASH_CLASS,
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
