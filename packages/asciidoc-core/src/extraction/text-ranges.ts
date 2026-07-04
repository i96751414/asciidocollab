/**
 * Character-range utilities shared across the extraction engine: the match→range helper, the
 * verbatim/comment region scanner, and the point-in-ranges test. Extraction skips matches that start
 * inside a verbatim range so code samples documenting AsciiDoc do not produce false references,
 * anchors, or attribute definitions. The single copy shared by the server (@asciidocollab/domain) and the editor (apps/web).
 */
import { VERBATIM_FENCE_RE } from './grammar';

/** A half-open character span `[from, to)` within a document. */
export interface TextSpan {
  /** Start offset, inclusive. */
  from: number;
  /** End offset, exclusive. */
  to: number;
}

/** The character range a regex match occupies (`from` inclusive, `to` exclusive). */
export function rangeOf(match: RegExpMatchArray): TextSpan {
  const from = match.index ?? 0;
  return { from, to: from + match[0].length };
}

/** Whether `pos` falls inside any of the (ascending, non-overlapping) ranges. */
export function isInRanges(pos: number, ranges: readonly TextSpan[]): boolean {
  return ranges.some((range) => pos >= range.from && pos < range.to);
}

/**
 * Character ranges of the document that are verbatim or comment regions — delimited listing/
 * literal/passthrough/comment blocks (their fences included) plus `//` line comments. Tokens
 * inside these are literal text, not real references/anchors, so extraction skips matches that
 * start within them (avoids false `unknown-xref` / `undefined-attribute` diagnostics on code
 * samples). An unterminated block extends to end of document, mirroring Asciidoctor.
 */
export function verbatimRanges(content: string): TextSpan[] {
  const ranges: TextSpan[] = [];
  let cursor = 0;
  let open: { delimiter: string; from: number } | null = null;
  for (const line of content.split('\n')) {
    const start = cursor;
    const lineEnd = cursor + line.length;
    cursor += line.length + 1; // account for the consumed newline
    // Match the RAW line (not trimmed): fences and `//` comments are only recognized at column 0.
    const fence = VERBATIM_FENCE_RE.exec(line);
    if (open !== null) {
      // A verbatim block ends only on a fence whose delimiter token equals the one that opened it.
      if (fence && fence[1] === open.delimiter) {
        ranges.push({ from: open.from, to: lineEnd });
        open = null;
      }
      continue;
    }
    if (fence) {
      open = { delimiter: fence[1], from: start };
      continue;
    }
    // `//` line comment at column 0 (a 4+ `////` fence was already handled as a block delimiter).
    if (line.startsWith('//')) ranges.push({ from: start, to: lineEnd });
  }
  if (open !== null) ranges.push({ from: open.from, to: content.length });
  return ranges;
}
