/**
 * Partial-include selectors: the `tags=`/`tag=` and `lines=` filters on an `include::[...]` directive.
 * Pure string parsing of the attribute list into ordered token/range lists. The single copy shared by
 * the server (`@asciidocollab/domain`) and the editor (`apps/web`).
 */
import { INCLUDE_TAGS_RE, INCLUDE_LINES_RE, SELECTOR_SEPARATOR_RE } from './grammar';

/**
 * Parse the tag filter from an include directive's attribute list (`tags=`/`tag=`). Tokens are
 * separated by `;` or `,`, may be quoted, and support negation (`!tag`) and the `*`/`**` wildcards.
 * Returns the ordered token list, or `null` when no tag selector is present (no filter).
 */
export function parseIncludeTags(attributes: string): string[] | null {
  const match = INCLUDE_TAGS_RE.exec(attributes);
  if (match === null) return null;
  const raw = match[1] ?? match[2] ?? match[3] ?? '';
  return raw
    .split(SELECTOR_SEPARATOR_RE)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * Parse the line filter from an include directive's attribute list (`lines=`). Supports a single
 * line (`2` ⇒ `[2, 2]`), a closed range (`2..4` ⇒ `[2, 4]`), multiple ranges (`1;3..4` or `1,3..4`),
 * and an open-ended range (`5..-1` or `5..` ⇒ `[5, null]`). Returns the ordered ranges, or
 * `null` when no line selector is present (no filter).
 */
export function parseIncludeLines(attributes: string): Array<[number, number | null]> | null {
  const match = INCLUDE_LINES_RE.exec(attributes);
  if (match === null) return null;
  const raw = match[1] ?? match[2] ?? match[3] ?? '';
  const ranges: Array<[number, number | null]> = [];
  for (const token of raw.split(SELECTOR_SEPARATOR_RE)) {
    const trimmed = token.trim();
    if (trimmed === '') continue;
    const dots = trimmed.indexOf('..');
    if (dots === -1) {
      const single = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(single)) ranges.push([single, single]);
      continue;
    }
    const start = Number.parseInt(trimmed.slice(0, dots), 10);
    if (Number.isNaN(start)) continue;
    const endRaw = trimmed.slice(dots + 2).trim();
    const end = Number.parseInt(endRaw, 10);
    // An open-ended range (`5..`, `5..-1`, or any negative end) reaches the end of file ⇒ null.
    ranges.push([start, endRaw === '' || Number.isNaN(end) || end < 0 ? null : end]);
  }
  return ranges;
}
