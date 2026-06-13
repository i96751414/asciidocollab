import { ExternalTokenizer, InputStream } from '@lezer/lr';

/** Character code constants used by the tokenizer. */
export const NEWLINE = 10;
export const SPACE = 32;
export const EQUALS = 61;
export const DASH = 45;
export const STAR = 42;
export const UNDERSCORE = 95;
export const PLUS = 43;
export const SLASH = 47;
export const COLON = 58;
export const PIPE = 124;
export const DOT = 46;
export const LBRACK = 91;
export const RBRACK = 93;
export const SEMICOLON = 59;
export const COMMA = 44;

const CONDITIONAL_DIRECTIVES = ['ifdef::', 'ifndef::', 'ifeval::', 'endif::'];

/** Mirror of the production `isBlockAttributeLine` (keep the two in sync). */
function isBlockAttributeLine(input: InputStream): boolean {
  if (input.peek(1) === LBRACK) return false;
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
    if (code !== SPACE && code !== 9 /* TAB */) return false;
  }
  return true;
}

/** Checks whether the current tokenizer position is at the start of a line. */
export function isLineStart(input: InputStream): boolean {
  return input.pos === 0 || input.peek(-1) === NEWLINE;
}

/** Advances the tokenizer to the end of the current line (including the newline). */
export function consumeToEOL(input: InputStream): void {
  while (input.next !== NEWLINE && input.next !== -1) input.advance();
  if (input.next === NEWLINE) input.advance();
}

/** Peeks ahead in the input stream to check for a specific string. */
export function peekString(input: InputStream, string_: string, offset = 0): boolean {
  for (let index = 0; index < string_.length; index++) {
    if (input.peek(offset + index) !== string_.codePointAt(index)) return false;
  }
  return true;
}

/** Returns true if the character code is alphanumeric (a-z, A-Z, 0-9). */
export function isAlphaNumber(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

/** Returns true if the character code is alphanumeric, a hyphen, or an underscore. */
export function isAlphaNumberOrDash(code: number): boolean {
  return isAlphaNumber(code) || code === 45 || code === 95;
}

/**
 * True when a list marker begins at `offset` (mirror of the production helper). Each pattern
 * requires a trailing space, so it never matches a bare block delimiter (`****`/`----`/`....`).
 */
export function startsListMarker(input: InputStream, offset: number): boolean {
  const code = input.peek(offset);
  if (code === STAR) {
    let n = 0;
    while (input.peek(offset + n) === STAR) n++;
    return input.peek(offset + n) === SPACE;
  }
  if (code === DASH) {
    return input.peek(offset + 1) === SPACE;
  }
  if (code === DOT) {
    let n = 0;
    while (input.peek(offset + n) === DOT) n++;
    return input.peek(offset + n) === SPACE;
  }
  if (code >= 48 && code <= 57) {
    let n = 0;
    while (input.peek(offset + n) >= 48 && input.peek(offset + n) <= 57) n++;
    return input.peek(offset + n) === DOT && input.peek(offset + n + 1) === SPACE;
  }
  return false;
}

/**
 * Creates an ExternalTokenizer for the AsciiDoc grammar that handles all block-level
 * and inline token patterns. Identical logic to the production tokenizer in
 * `asciidoc-block-tokens.ts` but using the shared helper functions for type safety.
 *
 * @param terms - The term table from buildParser.
 */
export function createTestBlockTokenizer(terms: Record<string, number>): ExternalTokenizer {
  return new ExternalTokenizer(
    (input: InputStream, stack) => {
      let ch = input.next;
      if (ch === -1) return;
      const atLineStart = isLineStart(input);

      // Inline footnote (can appear anywhere)
      if (ch >= 65 && ch <= 122 && peekString(input, 'footnote:[')) {
        let offset = 'footnote:['.length;
        while (input.peek(offset) !== 93 && input.peek(offset) !== NEWLINE && input.peek(offset) !== -1) offset++;
        if (input.peek(offset) === 93) {
          for (let index = 0; index < offset + 1; index++) input.advance();
          input.acceptToken(terms['footnoteToken']); return;
        }
      }

      // Inline macro (not at line start)
      if (!atLineStart && ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122))) {
        let nameLength = 0;
        while (nameLength < 200 && isAlphaNumberOrDash(input.peek(nameLength))) nameLength++;
        if (nameLength > 0 && input.peek(nameLength) === COLON && input.peek(nameLength + 1) !== COLON) {
          const afterColon = input.peek(nameLength + 1);
          if (afterColon !== SPACE && afterColon !== COLON && afterColon !== LBRACK && afterColon !== NEWLINE && afterColon !== -1) {
            let offset = nameLength + 1;
            while (input.peek(offset) !== LBRACK && input.peek(offset) !== NEWLINE && input.peek(offset) !== -1) offset++;
            if (input.peek(offset) === LBRACK) {
              offset++;
              while (input.peek(offset) !== 93 && input.peek(offset) !== NEWLINE && input.peek(offset) !== -1) offset++;
              if (input.peek(offset) === 93) {
                for (let index = 0; index < offset + 1; index++) input.advance();
                input.acceptToken(terms['inlineMacroToken']); return;
              }
            }
          }
        }
      }

      if (!atLineStart) return;

      // Mid-paragraph continuation (mirrors the production tokenizer): every non-blank line is
      // paragraph text until a blank line, so marker-looking lines never start a new block.
      if (input.next !== NEWLINE && stack.canShift(terms['paragraphLineToken'])) {
        consumeToEOL(input);
        input.acceptToken(terms['paragraphLineToken']);
        return;
      }

      // Indented list markers: skip leading whitespace only when a real list marker follows
      // (mirrors the production tokenizer), then re-read the current char for the block branches.
      let leadingWs = 0;
      while (input.peek(leadingWs) === SPACE || input.peek(leadingWs) === 9 /* TAB */) leadingWs++;
      if (leadingWs > 0 && startsListMarker(input, leadingWs)) {
        for (let index = 0; index < leadingWs; index++) input.advance();
        ch = input.next;
      }

      // Equals-based: docTitle, headings, exampleDelim
      if (ch === EQUALS) {
        let count = 0;
        while (input.peek(count) === EQUALS) count++;
        const after = input.peek(count);
        if (after === SPACE) {
          const afterSpace = input.peek(count + 1);
          if (count === 1 && afterSpace !== EQUALS) { consumeToEOL(input); input.acceptToken(terms['docTitleToken']); return; }
          if (count === 2 && afterSpace !== EQUALS) { consumeToEOL(input); input.acceptToken(terms['heading1Token']); return; }
          if (count === 3 && afterSpace !== EQUALS) { consumeToEOL(input); input.acceptToken(terms['heading2Token']); return; }
          if (count === 4 && afterSpace !== EQUALS) { consumeToEOL(input); input.acceptToken(terms['heading3Token']); return; }
          if (count === 5 && afterSpace !== EQUALS) { consumeToEOL(input); input.acceptToken(terms['heading4Token']); return; }
          if (count >= 6) { consumeToEOL(input); input.acceptToken(terms['heading5Token']); return; }
        }
        if (count >= 4 && (after === NEWLINE || after === -1)) { consumeToEOL(input); input.acceptToken(terms['exampleDelim']); return; }
        return;
      }

      if (ch === DASH) {
        let count = 0; while (input.peek(count) === DASH) count++;
        const after = input.peek(count);
        if (count >= 4 && (after === NEWLINE || after === -1)) { consumeToEOL(input); input.acceptToken(terms['listingDelim']); return; }
        if (count === 2 && (after === NEWLINE || after === -1)) { consumeToEOL(input); input.acceptToken(terms['openDelim']); return; }
        if (count === 1 && after === SPACE) {
          if (input.peek(count + 1) === LBRACK) {
            const boxChar = input.peek(count + 2);
            if ((boxChar === SPACE || boxChar === 120 || boxChar === 88 || boxChar === STAR) &&
                input.peek(count + 3) === 93 && input.peek(count + 4) === SPACE) {
              for (let index = 0; index < count + 5; index++) input.advance();
              input.acceptToken(terms['checklistMarker']); return;
            }
          }
          input.advance(); input.advance(); input.acceptToken(terms['unorderedMarker']); return;
        }
        return;
      }

      if (ch === STAR) {
        let count = 0; while (input.peek(count) === STAR) count++;
        const after = input.peek(count);
        if (count >= 4 && (after === NEWLINE || after === -1)) { consumeToEOL(input); input.acceptToken(terms['sidebarDelim']); return; }
        if (after === SPACE && input.peek(count + 1) === LBRACK) {
          const boxChar = input.peek(count + 2);
          if ((boxChar === SPACE || boxChar === 120 || boxChar === 88 || boxChar === STAR) && input.peek(count + 3) === 93 && input.peek(count + 4) === SPACE) {
            for (let index = 0; index < count + 5; index++) input.advance();
            input.acceptToken(terms['checklistMarker']); return;
          }
        }
        if (after === SPACE) { for (let index = 0; index <= count; index++) input.advance(); input.acceptToken(terms['unorderedMarker']); return; }
        return;
      }

      if (ch === UNDERSCORE) {
        let count = 0; while (input.peek(count) === UNDERSCORE) count++;
        if (count >= 4 && (input.peek(count) === NEWLINE || input.peek(count) === -1)) { consumeToEOL(input); input.acceptToken(terms['quoteDelim']); return; }
        return;
      }

      if (ch === PLUS) {
        let count = 0; while (input.peek(count) === PLUS) count++;
        if (count >= 4 && (input.peek(count) === NEWLINE || input.peek(count) === -1)) { consumeToEOL(input); input.acceptToken(terms['passthroughDelim']); return; }
        return;
      }

      if (ch === SLASH) {
        if (input.peek(1) !== SLASH) return;
        let count = 0; while (input.peek(count) === SLASH) count++;
        if (count >= 4 && (input.peek(count) === NEWLINE || input.peek(count) === -1)) { consumeToEOL(input); input.acceptToken(terms['commentBlockDelim']); return; }
        consumeToEOL(input); input.acceptToken(terms['commentLineToken']); return;
      }

      if (ch === COMMA) {
        if (input.peek(1) === EQUALS && input.peek(2) === EQUALS && input.peek(3) === EQUALS) {
          consumeToEOL(input); input.acceptToken(terms['csvTableDelim']); return;
        }
        return;
      }

      if (ch === COLON) {
        if (input.peek(1) === EQUALS && input.peek(2) === EQUALS && input.peek(3) === EQUALS) {
          consumeToEOL(input); input.acceptToken(terms['dsvTableDelim']); return;
        }
        let offset = 1;
        if (!isAlphaNumber(input.peek(offset))) return;
        offset++;
        while (offset < 200 && isAlphaNumberOrDash(input.peek(offset))) offset++;
        if (input.peek(offset) === COLON) { consumeToEOL(input); input.acceptToken(terms['attrEntryToken']); return; }
        return;
      }

      if (ch === PIPE) {
        if (input.peek(1) === EQUALS && input.peek(2) === EQUALS && input.peek(3) === EQUALS) {
          consumeToEOL(input); input.acceptToken(terms['tableDelim']); return;
        }
        return;
      }

      if (ch === DOT) {
        let count = 0; while (input.peek(count) === DOT) count++;
        const afterDots = input.peek(count);
        if (count >= 4 && (afterDots === NEWLINE || afterDots === -1)) {
          consumeToEOL(input); input.acceptToken(terms['literalDelim']); return;
        }
        if (afterDots === SPACE) {
          for (let index = 0; index <= count; index++) input.advance();
          input.acceptToken(terms['orderedMarker']); return;
        }
        if (count === 1) {
          const afterDot = input.peek(1);
          if (afterDot !== SPACE && afterDot !== 9 && afterDot !== DOT &&
              afterDot !== LBRACK && afterDot !== NEWLINE && afterDot !== -1) {
            consumeToEOL(input); input.acceptToken(terms['blockTitleToken']); return;
          }
        }
        return;
      }

      if (ch === LBRACK) {
        if (peekString(input, '[stem]')) { consumeToEOL(input); input.acceptToken(terms['stemAttrToken']); return; }
        const admonTypes = ['[NOTE]', '[TIP]', '[WARNING]', '[IMPORTANT]', '[CAUTION]'];
        for (const admonType of admonTypes) {
          if (peekString(input, admonType)) { consumeToEOL(input); input.acceptToken(terms['admonAttrToken']); return; }
        }
        if (isBlockAttributeLine(input)) { consumeToEOL(input); input.acceptToken(terms['blockAttrToken']); return; }
        return;
      }

      if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122)) {
        for (const directive of CONDITIONAL_DIRECTIVES) {
          if (peekString(input, directive)) { consumeToEOL(input); input.acceptToken(terms['conditionalToken']); return; }
        }
        const admonKeywords = ['NOTE: ', 'TIP: ', 'WARNING: ', 'IMPORTANT: ', 'CAUTION: '];
        for (const keyword of admonKeywords) {
          if (peekString(input, keyword)) { consumeToEOL(input); input.acceptToken(terms['admonitionLineToken']); return; }
        }

        let nameLength = 0;
        while (nameLength < 200 && isAlphaNumberOrDash(input.peek(nameLength))) nameLength++;

        if (nameLength > 0 && input.peek(nameLength) === COLON && input.peek(nameLength + 1) === COLON) {
          let offset = nameLength + 2;
          let lastClosePosition = -1;
          while (true) {
            const code = input.peek(offset);
            if (code === NEWLINE || code === -1) break;
            if (code === 93) lastClosePosition = offset;
            offset++;
          }
          if (lastClosePosition === offset - 1) {
            consumeToEOL(input); input.acceptToken(terms['blockMacroToken']); return;
          }
          consumeToEOL(input); input.acceptToken(terms['descListToken']); return;
        }

        if (nameLength > 0 && input.peek(nameLength) === SEMICOLON && input.peek(nameLength + 1) === SEMICOLON) {
          consumeToEOL(input); input.acceptToken(terms['descListToken']); return;
        }
      }

      if (ch >= 48 && ch <= 57) {
        let digits = 0;
        while (digits < 200 && input.peek(digits) >= 48 && input.peek(digits) <= 57) digits++;
        if (input.peek(digits) === DOT && input.peek(digits + 1) === SPACE) {
          for (let index = 0; index <= digits + 1; index++) input.advance();
          input.acceptToken(terms['orderedMarker']); return;
        }
        let offset = 1;
        while (offset < 200) {
          const code = input.peek(offset);
          if (code === COLON && input.peek(offset + 1) === COLON) {
            consumeToEOL(input); input.acceptToken(terms['descListToken']); return;
          }
          if (code === SEMICOLON && input.peek(offset + 1) === SEMICOLON) {
            consumeToEOL(input); input.acceptToken(terms['descListToken']); return;
          }
          if (code === NEWLINE || code === -1 || code === SPACE) break;
          offset++;
        }
      }

      // List / description continuation (mirrors the production tokenizer): a non-blank line
      // that started no block construct, attached only when the parser can shift it.
      if (input.next !== NEWLINE && input.next !== -1 && stack.canShift(terms['continuationLineToken'])) {
        consumeToEOL(input);
        input.acceptToken(terms['continuationLineToken']);
      }
    },
    { contextual: true },
  );
}
