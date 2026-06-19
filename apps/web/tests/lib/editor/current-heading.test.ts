import { currentHeadingIndex } from '@/lib/editor/current-heading';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

const entries: SectionOutlineEntry[] = [
  { level: 0, title: 'Title', line: 1, from: 0 },
  { level: 1, title: 'Intro', line: 5, from: 20 },
  { level: 2, title: 'Detail', line: 10, from: 60 },
  { level: 1, title: 'End', line: 20, from: 120 },
];

describe('currentHeadingIndex', () => {
  test('returns the nearest preceding heading by line', () => {
    expect(currentHeadingIndex(entries, 7)).toBe(1); // between Intro(5) and Detail(10)
    expect(currentHeadingIndex(entries, 12)).toBe(2);
    expect(currentHeadingIndex(entries, 100)).toBe(3);
  });

  test('returns the exact heading index when the cursor is on the heading line', () => {
    expect(currentHeadingIndex(entries, 5)).toBe(1);
    expect(currentHeadingIndex(entries, 1)).toBe(0);
  });

  test('returns -1 before the first heading', () => {
    const later = [{ level: 1, title: 'A', line: 5, from: 0 }];
    expect(currentHeadingIndex(later, 2)).toBe(-1);
  });

  test('returns -1 for a null cursor line', () => {
    expect(currentHeadingIndex(entries, null)).toBe(-1);
  });

  test('returns -1 for an empty outline', () => {
    expect(currentHeadingIndex([], 10)).toBe(-1);
  });

  test('never selects more than one (monotonic last match)', () => {
    const index = currentHeadingIndex(entries, 25);
    expect(index).toBe(3);
    // Only one entry has line <= 25 as the last match.
    const matches = entries.filter((entry) => entry.line <= 25);
    expect(matches.at(-1)).toBe(entries[index]);
  });
});
