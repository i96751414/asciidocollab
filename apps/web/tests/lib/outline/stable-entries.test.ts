import { sameOutlineEntries } from '@/lib/outline/stable-entries';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

const base: SectionOutlineEntry[] = [
  { level: 0, title: 'Root', line: 1, from: 0, sourceFileId: 'a', sourcePath: 'a.adoc', sourceLine: 1, isOpenFile: true },
  { level: 1, title: 'Child', line: 5, from: 40, sourceFileId: 'b', sourcePath: 'b.adoc', sourceLine: 1, isOpenFile: false },
];

/** Deep-clones the fixture so equality is tested by value, not reference. */
function clone(entries: SectionOutlineEntry[]): SectionOutlineEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

describe('sameOutlineEntries', () => {
  test('true for the same reference', () => {
    expect(sameOutlineEntries(base, base)).toBe(true);
  });

  test('true for distinct but value-equal arrays', () => {
    expect(sameOutlineEntries(base, clone(base))).toBe(true);
  });

  test('false when length differs', () => {
    expect(sameOutlineEntries(base, base.slice(0, 1))).toBe(false);
  });

  test('false when a title differs', () => {
    const other = clone(base);
    other[1].title = 'Changed';
    expect(sameOutlineEntries(base, other)).toBe(false);
  });

  test('false when isOpenFile differs (open file changed)', () => {
    const other = clone(base);
    other[1].isOpenFile = true;
    expect(sameOutlineEntries(base, other)).toBe(false);
  });

  test('false when sourceLine differs', () => {
    const other = clone(base);
    other[0].sourceLine = 9;
    expect(sameOutlineEntries(base, other)).toBe(false);
  });
});
