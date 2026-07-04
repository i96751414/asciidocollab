/**
 * Section-heading detection and auto-id generation. `realHeadingOffsets` locates the `={1,6}` lines
 * that are genuine section titles (at a block boundary, not absorbed into a paragraph);
 * `headingToId` slugifies a title into its Asciidoctor auto-id honouring `idprefix`/`idseparator`.
 * The single authority for both — the symbol extractor and completions reuse it rather than
 * re-deriving headings/ids. The single copy shared by the server (@asciidocollab/domain) and the editor (apps/web).
 */
import { DELIMITER_LINE_RE, BOUNDARY_CONSTRUCT_RE } from './grammar';

/** Asciidoctor's built-in defaults for the id-generation attributes. */
export const DEFAULT_ID_PREFIX = '_';
export const DEFAULT_ID_SEPARATOR = '_';

/**
 * Offsets (line starts) of the `={1,6} text` lines that are genuine section titles — those at a
 * block boundary rather than absorbed into a paragraph. Filters the raw heading matches in
 * `extractSymbols` so prose like `text\n== Foo` is not mistaken for a section.
 */
export function realHeadingOffsets(content: string): Set<number> {
  const offsets = new Set<number>();
  let cursor = 0;
  let openDelimiter: string | null = null;
  let inParagraph = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const start = cursor;
    cursor += line.length + 1;
    if (openDelimiter !== null) {
      if (trimmed === openDelimiter) openDelimiter = null;
      continue;
    }
    if (trimmed === '') {
      inParagraph = false;
      continue;
    }
    if (inParagraph) continue; // absorbed paragraph continuation — starts no block
    if (DELIMITER_LINE_RE.test(trimmed)) {
      openDelimiter = trimmed;
      continue;
    }
    if (/^={1,6}\s+\S/.test(line)) {
      offsets.add(start);
      continue;
    }
    if (!BOUNDARY_CONSTRUCT_RE.test(trimmed)) inParagraph = true;
  }
  return offsets;
}

/** Escapes a string for literal use inside a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Auto-generate a section id from heading text (Asciidoctor-style), honouring the resolved
 * `idprefix` / `idseparator` in effect. The title is lower-cased and runs of non-alphanumeric
 * characters collapse to the separator, with leading/trailing separators stripped, then the prefix
 * is prepended. With the defaults (`_` / `_`) this yields the familiar `_my_section` slug.
 *
 * @param title - The heading's title text.
 * @param options - The resolved `idprefix` / `idseparator`; each defaults to `_`.
 * @returns The auto-generated section id.
 */
export function headingToId(title: string, options: { idprefix?: string; idseparator?: string } = {}): string {
  const idprefix = options.idprefix ?? DEFAULT_ID_PREFIX;
  const idseparator = options.idseparator ?? DEFAULT_ID_SEPARATOR;
  const slug = title.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, idseparator);
  // An empty separator removes invalid-char runs outright; otherwise strip leading/trailing separators.
  const body =
    idseparator === ''
      ? slug
      : slug.replaceAll(new RegExp(`^(?:${escapeRegExp(idseparator)})+|(?:${escapeRegExp(idseparator)})+$`, 'g'), '');
  return idprefix + body;
}
