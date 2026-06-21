import { mapOutlinePresence } from '@/lib/outline/outline-presence';
import type { OutlinePeer } from '@/lib/outline/outline-presence';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

function makePeer(userId: string, cursorLine: number, overrides: Partial<OutlinePeer> = {}): OutlinePeer {
  return {
    clientId: 1,
    userId,
    name: `User ${userId}`,
    color: '#ff0000',
    colorLight: '#ffaaaa',
    cursorLine,
    ...overrides,
  };
}

const headings: SectionOutlineEntry[] = [
  { level: 0, title: 'Doc Title', line: 1, from: 0, sourceFileId: 'id-a', sourcePath: 'a.adoc', sourceLine: 1, isOpenFile: true },
  { level: 1, title: 'Section One', line: 3, from: 20, sourceFileId: 'id-a', sourcePath: 'a.adoc', sourceLine: 3, isOpenFile: true },
  { level: 1, title: 'Section Two', line: 8, from: 80, sourceFileId: 'id-a', sourcePath: 'a.adoc', sourceLine: 8, isOpenFile: true },
  { level: 1, title: 'Child Heading', line: 12, from: 120, sourceFileId: 'id-b', sourcePath: 'b.adoc', sourceLine: 2, isOpenFile: false },
];

describe('mapOutlinePresence', () => {
  test('attributes a peer to the nearest preceding heading in their file', () => {
    const peers = new Map([
      ['id-a', [makePeer('u1', 5)]],
    ]);
    const result = mapOutlinePresence(headings, peers);
    // cursorLine 5 in id-a is under Section One (sourceLine 3), not Section Two (sourceLine 8)
    expect(result.get('id-a:3')).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 'u1' })]));
    expect(result.has('id-a:8')).toBe(false);
  });

  test('attributes correctly to the later heading when cursor is past it', () => {
    const peers = new Map([
      ['id-a', [makePeer('u1', 10)]],
    ]);
    const result = mapOutlinePresence(headings, peers);
    // cursorLine 10 in id-a is under Section Two (sourceLine 8)
    expect(result.get('id-a:8')).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 'u1' })]));
    expect(result.has('id-a:3')).toBe(false);
  });

  test('cursor above the first heading in its file is skipped (no attribution)', () => {
    // In b.adoc, the first heading is at sourceLine 2; cursor at line 1 is above it.
    const peers = new Map([
      ['id-b', [makePeer('u1', 1)]],
    ]);
    const result = mapOutlinePresence(headings, peers);
    expect(result.size).toBe(0);
  });

  test('out-of-range cursorLine (≤ 0) is skipped (Principle IX)', () => {
    const peers = new Map([
      ['id-a', [makePeer('u1', 0), makePeer('u2', -5)]],
    ]);
    const result = mapOutlinePresence(headings, peers);
    expect(result.size).toBe(0);
  });

  test('multiple peers on the same heading all appear in the entry list', () => {
    const peers = new Map([
      ['id-a', [makePeer('u1', 5), makePeer('u2', 6)]],
    ]);
    const result = mapOutlinePresence(headings, peers);
    const entry = result.get('id-a:3');
    expect(entry).toBeDefined();
    expect(entry!.some((p) => p.userId === 'u1')).toBe(true);
    expect(entry!.some((p) => p.userId === 'u2')).toBe(true);
  });

  test('peers in different files are attributed independently', () => {
    const peers = new Map([
      ['id-a', [makePeer('u1', 4)]],
      ['id-b', [makePeer('u2', 3)]],
    ]);
    const result = mapOutlinePresence(headings, peers);
    // u1 → id-a Section One (sourceLine 3)
    expect(result.get('id-a:3')).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 'u1' })]));
    // u2 → id-b Child Heading (sourceLine 2)
    expect(result.get('id-b:2')).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 'u2' })]));
  });

  test('empty entries list returns empty map', () => {
    const peers = new Map([['id-a', [makePeer('u1', 5)]]]);
    expect(mapOutlinePresence([], peers).size).toBe(0);
  });

  test('empty peers map returns empty result', () => {
    expect(mapOutlinePresence(headings, new Map()).size).toBe(0);
  });

  test('peer for a file not in entries is skipped gracefully', () => {
    const peers = new Map([['id-unknown', [makePeer('u1', 5)]]]);
    expect(mapOutlinePresence(headings, peers).size).toBe(0);
  });
});
