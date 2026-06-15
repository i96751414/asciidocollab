/**
 * Reusable scanning primitives for the AsciiDoc block-level external tokenizer — the pure
 * char-code constants and stateless helper predicates extracted from
 * `asciidoc-block-token-logic.ts`. These are the low-level building blocks the hot-path
 * tokenizer switch composes; isolating them here keeps the factory focused on token dispatch.
 *
 * Nothing here depends on the generated `asciidoc-parser` or on any term-id map, so it stays
 * trivially shared between the production tokenizer and the grammar test harness.
 */

export const NEWLINE = 10, SPACE = 32, TAB = 9, EQUALS = 61, DASH = 45, STAR = 42, UNDERSCORE = 95;
export const PLUS = 43, SLASH = 47, COLON = 58, PIPE = 124, DOT = 46, LBRACK = 91, RBRACK = 93, SEMICOLON = 59, COMMA = 44;
export const APOSTROPHE = 39, LANGLE = 60;

/**
 * A look-ahead view over the input being tokenized, exposing the char code `offset`
 * positions from the current scan position.
 */
interface PeekInput {
  /**
   * Returns the char code `offset` positions ahead of the cursor, or `-1` past the end.
   *
   * @param offset - How many positions ahead of the cursor to read.
   * @returns The char code at that position, or `-1` when out of range.
   */
  peek: (offset: number) => number;
}

/**
 * A look-ahead view that also knows the absolute cursor position, used to detect line starts.
 */
interface PeekInputWithPos extends PeekInput {
  /**
   * The absolute cursor position within the input.
   */
  pos: number;
}

/**
 * A consuming view over the input, exposing the current char code and a cursor advance.
 */
interface ConsumingInput {
  /**
   * The char code at the cursor, or `-1` at the end of input.
   */
  next: number;
  /**
   * Advances the cursor one position forward.
   */
  advance: () => void;
}

/**
 * Reports whether the current line consists solely of `min`+ repetitions of `code`
 * (optionally trailed by whitespace) — for example `'''` thematic break, `<<<` page break.
 *
 * @param input - The look-ahead view over the input.
 * @param code - The char code the line must repeat.
 * @param min - The minimum number of repetitions required.
 * @returns `true` when the line is such a break line.
 */
export function isBreakLine(input: PeekInput, code: number, min: number): boolean {
  let count = 0;
  while (input.peek(count) === code) count++;
  if (count < min) return false;
  let offset = count;
  let next = input.peek(offset);
  while (next === SPACE || next === TAB) {
    offset++;
    next = input.peek(offset);
  }
  return next === NEWLINE || next === -1;
}

/**
 * Reports whether the current line is a generic block-attribute line `[..]` whose last
 * non-whitespace character is a closing bracket (for example `[source,ruby]`,
 * `[cols="1,1"]`, `[.lead]`). Excludes block anchors `[[id]]` (start `[[`).
 *
 * @param input - The look-ahead view over the input.
 * @returns `true` when the line is a generic block-attribute line.
 */
export function isBlockAttributeLine(input: PeekInput): boolean {
  if (input.peek(1) === LBRACK) return false; // `[[` block anchor, not an attribute line
  let offset = 1;
  let lastClose = -1;
  while (offset < 2000) {
    const code = input.peek(offset);
    if (code === NEWLINE || code === -1) break;
    if (code === RBRACK) lastClose = offset;
    offset++;
  }
  if (lastClose < 1) return false;
  for (let position = lastClose + 1; position < offset; position++) {
    const code = input.peek(position);
    if (code !== SPACE && code !== TAB) return false;
  }
  return true;
}

/**
 * Reports whether a list marker begins at `offset` (used to allow leading whitespace before a
 * marker, which Asciidoctor permits). Each pattern requires a trailing space, so it never matches
 * a bare block delimiter line (`****`, `----`, `....`) — those have no space and are column-0 only.
 *
 * @param input - The look-ahead view over the input.
 * @param offset - The position at which to test for a marker.
 * @returns `true` when a list marker starts at that position.
 */
export function startsListMarker(input: PeekInput, offset: number): boolean {
  const code = input.peek(offset);
  if (code === STAR) {
    let n = 0;
    while (input.peek(offset + n) === STAR) n++;
    return input.peek(offset + n) === SPACE; // `* `, `** ` … (checklist is `* [x] `, also a space)
  }
  if (code === DASH) {
    return input.peek(offset + 1) === SPACE; // single `- ` only; `--`/`----` are delimiters
  }
  if (code === DOT) {
    let n = 0;
    while (input.peek(offset + n) === DOT) n++;
    return input.peek(offset + n) === SPACE; // `. `, `.. ` …
  }
  if (code >= 48 && code <= 57) {
    let n = 0;
    while (input.peek(offset + n) >= 48 && input.peek(offset + n) <= 57) n++;
    return input.peek(offset + n) === DOT && input.peek(offset + n + 1) === SPACE; // `1. `
  }
  return false;
}

/**
 * Reports whether the cursor sits at the start of a line (column 0 or just after a newline).
 *
 * @param input - The look-ahead view that also tracks the cursor position.
 * @returns `true` when the cursor is at a line start.
 */
export function isLineStart(input: PeekInputWithPos): boolean {
  return input.pos === 0 || input.peek(-1) === NEWLINE;
}

/**
 * Advances the cursor to the end of the current line, consuming the trailing newline if present.
 *
 * @param input - The consuming view over the input.
 */
export function consumeToEOL(input: ConsumingInput): void {
  while (input.next !== NEWLINE && input.next !== -1) input.advance();
  if (input.next === NEWLINE) input.advance();
}

/**
 * Reports whether `string_` appears in the input starting `offset` positions ahead of the cursor.
 *
 * @param input - The look-ahead view over the input.
 * @param string_ - The literal text to match.
 * @param offset - The position at which matching begins.
 * @returns `true` when the literal matches at that position.
 */
export function peekString(input: PeekInput, string_: string, offset = 0): boolean {
  for (let index = 0; index < string_.length; index++) {
    if (input.peek(offset + index) !== string_.codePointAt(index)) return false;
  }
  return true;
}

/**
 * Reports whether `code` is an ASCII letter or digit.
 *
 * @param code - The char code to classify.
 * @returns `true` for `A`-`Z`, `a`-`z`, and `0`-`9`.
 */
export function isAlphaNumber(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

/**
 * Reports whether `code` is alphanumeric, a dash, or an underscore (the identifier char set).
 *
 * @param code - The char code to classify.
 * @returns `true` for alphanumerics plus `-` and `_`.
 */
export function isAlphaNumberOrDash(code: number): boolean {
  return isAlphaNumber(code) || code === 45 || code === 95;
}
