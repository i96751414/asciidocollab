import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

/**
 * Returns the index of the outline entry whose section contains `line` — the last entry with
 * `entry.line <= line` (028/US2). The cursor "belongs" to the nearest preceding heading, so exactly
 * one row is ever current. Returns -1 when the cursor is before the first heading, when `line` is
 * null, or when the outline is empty.
 *
 * @param entries - The section outline, in document (ascending-line) order.
 * @param line - The 1-based cursor line, or null when unknown.
 * @returns The current entry index, or -1 when none precedes the cursor.
 */
export function currentHeadingIndex(entries: SectionOutlineEntry[], line: number | null): number {
  if (line === null) return -1;
  let index = -1;
  for (const [position, entry] of entries.entries()) {
    if (entry.line <= line) index = position;
    else break;
  }
  return index;
}
