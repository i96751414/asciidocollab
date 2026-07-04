import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

/**
 * Returns the index of the outline entry whose section contains `line` — the last entry whose
 * open-file line is `<= line`. The cursor "belongs" to the nearest preceding heading, so
 * exactly one row is ever current. Returns -1 when the cursor is before the first heading, when
 * `line` is null, or when the outline is empty.
 *
 * `line` is the cursor's line within the OPEN file. Each entry is compared on its `sourceLine` (its
 * line within its own source file) when present, falling back to `line` (the assembled-document
 * line) otherwise. In the full-document outline these diverge — an include shifts later sections down
 * in the assembled text — and the caller has already restricted `entries` to open-file rows, so the
 * source line is the correct basis for comparison.
 *
 * @param entries - The section outline, in document (ascending-line) order.
 * @param line - The 1-based cursor line within the open file, or null when unknown.
 * @returns The current entry index, or -1 when none precedes the cursor.
 */
export function currentHeadingIndex(entries: SectionOutlineEntry[], line: number | null): number {
  if (line === null) return -1;
  let index = -1;
  for (const [position, entry] of entries.entries()) {
    if ((entry.sourceLine ?? entry.line) <= line) index = position;
    else break;
  }
  return index;
}
