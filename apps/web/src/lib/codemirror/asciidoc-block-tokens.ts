import { ExternalTokenizer } from '@lezer/lr';
import {
  docTitleToken as documentTitleToken,
  heading1Token,
  heading2Token,
  heading3Token,
  heading4Token,
  heading5Token,
  attrEntryToken as attributeEntryToken,
  commentBlockDelim,
  commentLineToken,
  admonitionLineToken,
  blockMacroToken,
  descListToken,
  listingDelim,
  exampleDelim,
  sidebarDelim,
  quoteDelim,
  passthroughDelim,
  openDelim,
  tableDelim,
  stemAttrToken as stemAttributeToken,
  admonAttrToken as admonitionAttributeToken,
  checklistMarker,
  unorderedMarker,
  orderedMarker,
  inlineMacroToken,
  footnoteToken,
} from './asciidoc-parser.terms.js';

const NEWLINE = 10, SPACE = 32, EQUALS = 61, DASH = 45, STAR = 42, UNDERSCORE = 95;
const PLUS = 43, SLASH = 47, COLON = 58, PIPE = 124, DOT = 46, LBRACK = 91;

function isLineStart(input: { pos: number; peek: (offset: number) => number }): boolean {
  return input.pos === 0 || input.peek(-1) === NEWLINE;
}

function consumeToEOL(input: { next: number; advance: () => void }): void {
  while (input.next !== NEWLINE && input.next !== -1) input.advance();
  if (input.next === NEWLINE) input.advance();
}

function peekString(input: { peek: (offset: number) => number }, string_: string, offset = 0): boolean {
  for (let index = 0; index < string_.length; index++) {
    if (input.peek(offset + index) !== string_.codePointAt(index)) return false;
  }
  return true;
}

function isAlphaNumber(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function isAlphaNumberOrDash(code: number): boolean {
  return isAlphaNumber(code) || code === 45 || code === 95;
}

export const blockTokenizer = new ExternalTokenizer(
  (input, _stack) => {
    if (!isLineStart(input)) return;
    const ch = input.next;
    if (ch === -1) return;

    // ── '=' : docTitle, headings, exampleDelim ────────────────────────────────
    if (ch === EQUALS) {
      let count = 0;
      while (input.peek(count) === EQUALS) count++;
      const afterEquals = input.peek(count);

      if (afterEquals === SPACE) {
        const afterSpace = input.peek(count + 1);
        if (count === 1 && afterSpace !== EQUALS) { consumeToEOL(input); input.acceptToken(documentTitleToken); return; }
        if (count === 2 && afterSpace !== EQUALS) { consumeToEOL(input); input.acceptToken(heading1Token); return; }
        if (count === 3 && afterSpace !== EQUALS) { consumeToEOL(input); input.acceptToken(heading2Token); return; }
        if (count === 4 && afterSpace !== EQUALS) { consumeToEOL(input); input.acceptToken(heading3Token); return; }
        if (count === 5 && afterSpace !== EQUALS) { consumeToEOL(input); input.acceptToken(heading4Token); return; }
        if (count >= 6) { consumeToEOL(input); input.acceptToken(heading5Token); return; }
      }
      if (count >= 4 && (afterEquals === NEWLINE || afterEquals === -1)) {
        consumeToEOL(input); input.acceptToken(exampleDelim); return;
      }
      return;
    }

    // ── '-' : listingDelim, openDelim, unorderedMarker "- " ───────────────────
    if (ch === DASH) {
      let count = 0;
      while (input.peek(count) === DASH) count++;
      const afterDash = input.peek(count);
      if (count >= 4 && (afterDash === NEWLINE || afterDash === -1)) { consumeToEOL(input); input.acceptToken(listingDelim); return; }
      if (count === 2 && (afterDash === NEWLINE || afterDash === -1)) { consumeToEOL(input); input.acceptToken(openDelim); return; }
      if (count === 1 && afterDash === SPACE) { input.advance(); input.advance(); input.acceptToken(unorderedMarker); return; }
      return;
    }

    // ── '*' : sidebarDelim, checklistMarker, unorderedMarker ──────────────────
    if (ch === STAR) {
      let count = 0;
      while (input.peek(count) === STAR) count++;
      const afterStar = input.peek(count);
      if (count >= 4 && (afterStar === NEWLINE || afterStar === -1)) { consumeToEOL(input); input.acceptToken(sidebarDelim); return; }
      if (afterStar === SPACE && input.peek(count + 1) === LBRACK) {
        const boxChar = input.peek(count + 2);
        if ((boxChar === SPACE || boxChar === 120 || boxChar === 88) &&
            input.peek(count + 3) === 93 && input.peek(count + 4) === SPACE) {
          for (let index = 0; index < count + 5; index++) input.advance();
          input.acceptToken(checklistMarker); return;
        }
      }
      if (afterStar === SPACE) {
        for (let index = 0; index <= count; index++) input.advance();
        input.acceptToken(unorderedMarker); return;
      }
      return;
    }

    // ── '_' : quoteDelim ───────────────────────────────────────────────────────
    if (ch === UNDERSCORE) {
      let count = 0;
      while (input.peek(count) === UNDERSCORE) count++;
      const afterU = input.peek(count);
      if (count >= 4 && (afterU === NEWLINE || afterU === -1)) { consumeToEOL(input); input.acceptToken(quoteDelim); return; }
      return;
    }

    // ── '+' : passthroughDelim ────────────────────────────────────────────────
    if (ch === PLUS) {
      let count = 0;
      while (input.peek(count) === PLUS) count++;
      const afterPlus = input.peek(count);
      if (count >= 4 && (afterPlus === NEWLINE || afterPlus === -1)) { consumeToEOL(input); input.acceptToken(passthroughDelim); return; }
      return;
    }

    // ── '/' : commentBlockDelim, commentLineToken ─────────────────────────────
    if (ch === SLASH) {
      if (input.peek(1) !== SLASH) return;
      let count = 0;
      while (input.peek(count) === SLASH) count++;
      const afterSlash = input.peek(count);
      if (count >= 4 && (afterSlash === NEWLINE || afterSlash === -1)) { consumeToEOL(input); input.acceptToken(commentBlockDelim); return; }
      consumeToEOL(input); input.acceptToken(commentLineToken); return;
    }

    // ── ':' : attrEntryToken ──────────────────────────────────────────────────
    if (ch === COLON) {
      let offset = 1;
      const firstChar = input.peek(offset);
      if (!isAlphaNumber(firstChar)) return;
      offset++;
      while (offset < 200 && isAlphaNumberOrDash(input.peek(offset))) offset++;
      if (input.peek(offset) === COLON) { consumeToEOL(input); input.acceptToken(attributeEntryToken); return; }
      return;
    }

    // ── '|' : tableDelim ──────────────────────────────────────────────────────
    if (ch === PIPE) {
      if (input.peek(1) === EQUALS && input.peek(2) === EQUALS && input.peek(3) === EQUALS) {
        consumeToEOL(input); input.acceptToken(tableDelim); return;
      }
      return;
    }

    // ── '.' : orderedMarker ───────────────────────────────────────────────────
    if (ch === DOT) {
      let count = 0;
      while (input.peek(count) === DOT) count++;
      if (input.peek(count) === SPACE) {
        for (let index = 0; index <= count; index++) input.advance();
        input.acceptToken(orderedMarker); return;
      }
      return;
    }

    // ── '[' : stemAttributeToken, admonitionAttributeToken ───────────────────
    if (ch === LBRACK) {
      if (peekString(input, '[stem]')) { consumeToEOL(input); input.acceptToken(stemAttributeToken); return; }
      const admonTypes = ['[NOTE]', '[TIP]', '[WARNING]', '[IMPORTANT]', '[CAUTION]'];
      for (const admonType of admonTypes) {
        if (peekString(input, admonType)) { consumeToEOL(input); input.acceptToken(admonitionAttributeToken); return; }
      }
      return;
    }

    // ── Letters ───────────────────────────────────────────────────────────────
    if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122)) {
      // footnoteToken (works at non-line-start too but checked here as well)
      if (peekString(input, 'footnote:[')) {
        let offset = 'footnote:['.length;
        while (input.peek(offset) !== 93 && input.peek(offset) !== NEWLINE && input.peek(offset) !== -1) offset++;
        if (input.peek(offset) === 93) {
          for (let index = 0; index < offset + 1; index++) input.advance();
          input.acceptToken(footnoteToken); return;
        }
      }

      // admonitionLineToken: NOTE: , TIP: , etc.
      const admonParagraphs = ['NOTE: ', 'TIP: ', 'WARNING: ', 'IMPORTANT: ', 'CAUTION: '];
      for (const keyword of admonParagraphs) {
        if (peekString(input, keyword)) { consumeToEOL(input); input.acceptToken(admonitionLineToken); return; }
      }

      // Read identifier name
      let nameLength = 0;
      while (nameLength < 200 && isAlphaNumberOrDash(input.peek(nameLength))) nameLength++;

      // inlineMacroToken (only at line-start for this path; non-start is handled elsewhere)
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
              input.acceptToken(inlineMacroToken); return;
            }
          }
        }
      }

      // blockMacroToken or descListToken
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
          consumeToEOL(input); input.acceptToken(blockMacroToken); return;
        }
        consumeToEOL(input); input.acceptToken(descListToken); return;
      }
    }

    // ── Digit-starting description lists ───────────────────────────────────────
    if (ch >= 48 && ch <= 57) {
      let offset = 1;
      while (offset < 200) {
        const code = input.peek(offset);
        if (code === COLON && input.peek(offset + 1) === COLON) {
          consumeToEOL(input); input.acceptToken(descListToken); return;
        }
        if (code === NEWLINE || code === -1 || code === SPACE) break;
        offset++;
      }
    }
  },
  { contextual: true },
);
