import {
  foldStorageKey,
  headingsToFoldForLevel,
  parseFoldState,
} from '@/lib/codemirror/asciidoc-fold-persist';
import { computeHeadingLevels } from '@/lib/codemirror/asciidoc-heading-levels';

describe('foldStorageKey', () => {
  test('keys fold state by project and file', () => {
    expect(foldStorageKey('p1', 'f2')).toBe('asciidocollab:folds:p1:f2');
  });
});

describe('headingsToFoldForLevel (FR-042 fold-to-level)', () => {
  const headings = computeHeadingLevels('= T\n\n== A\n\n=== B\n\n== C\n');
  test('level 2 folds sections at effective level ≥ 2', () => {
    const folded = headingsToFoldForLevel(headings, 2);
    expect(folded.map((heading) => heading.effectiveLevel).every((level) => level >= 2)).toBe(true);
    expect(folded.length).toBe(1); // only the level-2 "=== B"
  });
  test('level 1 folds the level-1 sections too', () => {
    expect(headingsToFoldForLevel(headings, 1).length).toBeGreaterThan(1);
  });
  test('excludes discrete and over-max headings', () => {
    const withDiscrete = computeHeadingLevels('[discrete]\n== D\n');
    expect(headingsToFoldForLevel(withDiscrete, 1)).toHaveLength(0);
  });
});

describe('parseFoldState (FR-043 restore + reconcile)', () => {
  test('parses valid fold ranges within the document', () => {
    expect(parseFoldState('[{"from":2,"to":8}]', 20)).toEqual([{ from: 2, to: 8 }]);
  });
  test('drops ranges outside the current document (reconcile after external change)', () => {
    expect(parseFoldState('[{"from":2,"to":80}]', 20)).toEqual([]);
  });
  test('drops malformed entries', () => {
    expect(parseFoldState('[{"from":"x"},{"to":3},5]', 20)).toEqual([]);
  });
  test('handles invalid JSON / null', () => {
    expect(parseFoldState('not json', 20)).toEqual([]);
    expect(parseFoldState(null, 20)).toEqual([]);
  });
  test('rejects inverted/empty ranges', () => {
    expect(parseFoldState('[{"from":5,"to":5},{"from":9,"to":4}]', 20)).toEqual([]);
  });
});
