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
  literalDelim,
  exampleDelim,
  sidebarDelim,
  quoteDelim,
  passthroughDelim,
  openDelim,
  tableDelim,
  csvTableDelim,
  dsvTableDelim,
  stemAttrToken as stemAttributeToken,
  admonAttrToken as admonitionAttributeToken,
  conditionalToken,
  blockAttrToken as blockAttributeToken,
  checklistMarker,
  unorderedMarker,
  orderedMarker,
  inlineMacroToken,
  footnoteToken,
  blockTitleToken,
  thematicBreakToken,
  pageBreakToken,
  hardBreakToken,
  continuationLineToken,
  paragraphLineToken,
} from './asciidoc-parser.terms.js';

const NEWLINE = 10, SPACE = 32, TAB = 9, EQUALS = 61, DASH = 45, STAR = 42, UNDERSCORE = 95;
const PLUS = 43, SLASH = 47, COLON = 58, PIPE = 124, DOT = 46, LBRACK = 91, RBRACK = 93, SEMICOLON = 59, COMMA = 44;
const APOSTROPHE = 39, LANGLE = 60;

/**
 * True when the current line consists solely of `min`+ repetitions of `code`
 * (optionally trailed by whitespace) — e.g. `'''` thematic break, `<<<` page break.
 */
function isBreakLine(input: { peek: (offset: number) => number }, code: number, min: number): boolean {
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

// Conditional preprocessor directives — highlighted distinctly from generic block macros (FR-051).
const CONDITIONAL_DIRECTIVES = ['ifdef::', 'ifndef::', 'ifeval::', 'endif::'];

/**
 * True when the current line is a generic block-attribute line `[..]` whose last
 * non-whitespace character is a closing bracket (e.g. `[source,ruby]`,
 * `[cols="1,1"]`, `[.lead]`). Excludes block anchors `[[id]]` (start `[[`).
 */
function isBlockAttributeLine(input: { peek: (offset: number) => number }): boolean {
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

// True when a list marker begins at `offset` (used to allow leading whitespace before a marker,
// which Asciidoctor permits). Each pattern requires a trailing space, so it never matches a bare
// block delimiter line (`****`, `----`, `....`) — those have no space and are column-0 only.
function startsListMarker(input: { peek: (offset: number) => number }, offset: number): boolean {
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
  (input, stack) => {
    // Hard line break: a `+` preceded by whitespace and immediately followed by a line end.
    // Checked before the line-start gate so it is recognised mid-document; consumes only the
    // `+` (the newline stays a separate token). `peek(-1)` sees the already-consumed space.
    if (input.next === PLUS && (input.peek(-1) === SPACE || input.peek(-1) === TAB) &&
        (input.peek(1) === NEWLINE || input.peek(1) === -1)) {
      input.advance();
      input.acceptToken(hardBreakToken);
      return;
    }

    if (!isLineStart(input)) return;
    if (input.next === -1) return;

    // Mid-paragraph: Asciidoctor consumes every non-blank line into the paragraph until a blank
    // line, so a line that looks like a heading or list marker here is plain text, not a new block.
    // Checked first so it wins over the block branches; `canShift` is true only inside a paragraph.
    if (input.next !== NEWLINE && stack.canShift(paragraphLineToken)) {
      consumeToEOL(input);
      input.acceptToken(paragraphLineToken);
      return;
    }

    // Asciidoctor allows list markers to be indented. Skip leading whitespace only when a real
    // list marker follows, so the accepted marker token still spans from the line start.
    let leadingWs = 0;
    while (input.peek(leadingWs) === SPACE || input.peek(leadingWs) === TAB) leadingWs++;
    if (leadingWs > 0 && startsListMarker(input, leadingWs)) {
      for (let index = 0; index < leadingWs; index++) input.advance();
    }

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
      if (count === 1 && afterDash === SPACE) {
        // Dash checklist `- [ ] ` — checked before the plain dash bullet (Asciidoctor allows
        // checkboxes on `-` as well as `*`); produces the existing ChecklistItem node.
        if (input.peek(count + 1) === LBRACK) {
          const boxChar = input.peek(count + 2);
          // Checked box: `x`, `X`, or `*`; unchecked: a space. (Asciidoctor accepts all three.)
          if ((boxChar === SPACE || boxChar === 120 || boxChar === 88 || boxChar === STAR) &&
              input.peek(count + 3) === 93 && input.peek(count + 4) === SPACE) {
            for (let index = 0; index < count + 5; index++) input.advance();
            input.acceptToken(checklistMarker); return;
          }
        }
        input.advance(); input.advance(); input.acceptToken(unorderedMarker); return;
      }
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
        if ((boxChar === SPACE || boxChar === 120 || boxChar === 88 || boxChar === STAR) &&
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

    // ── "'" : thematicBreak (`'''`) ───────────────────────────────────────────
    if (ch === APOSTROPHE) {
      if (isBreakLine(input, APOSTROPHE, 3)) { consumeToEOL(input); input.acceptToken(thematicBreakToken); return; }
      return;
    }

    // ── '<' : pageBreak (`<<<`) ────────────────────────────────────────────────
    if (ch === LANGLE) {
      if (isBreakLine(input, LANGLE, 3)) { consumeToEOL(input); input.acceptToken(pageBreakToken); return; }
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

    // ── ',' : csvTableDelim (`,===`) ──────────────────────────────────────────
    if (ch === COMMA) {
      if (input.peek(1) === EQUALS && input.peek(2) === EQUALS && input.peek(3) === EQUALS) {
        consumeToEOL(input); input.acceptToken(csvTableDelim); return;
      }
      return;
    }

    // ── ':' : dsvTableDelim (`:===`), attrEntryToken ──────────────────────────
    if (ch === COLON) {
      if (input.peek(1) === EQUALS && input.peek(2) === EQUALS && input.peek(3) === EQUALS) {
        consumeToEOL(input); input.acceptToken(dsvTableDelim); return;
      }
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

    // ── '.' : blockTitleToken, orderedMarker ─────────────────────────────────
    if (ch === DOT) {
      let count = 0;
      while (input.peek(count) === DOT) count++;
      const afterDots = input.peek(count);
      // Literal block delimiter: 4+ dots alone on a line (`....`). Checked before the ordered
      // marker so `.... ` (4 dots + space) still tokenizes as an ordered depth-4 item (FR-008).
      if (count >= 4 && (afterDots === NEWLINE || afterDots === -1)) {
        consumeToEOL(input); input.acceptToken(literalDelim); return;
      }
      if (afterDots === SPACE) {
        for (let index = 0; index <= count; index++) input.advance();
        input.acceptToken(orderedMarker); return;
      }
      // Block title: single '.' followed by non-whitespace, non-'.', non-'['
      if (count === 1) {
        const afterDot = input.peek(1);
        if (afterDot !== SPACE && afterDot !== 9 /* TAB */ && afterDot !== DOT &&
            afterDot !== LBRACK && afterDot !== NEWLINE && afterDot !== -1) {
          consumeToEOL(input); input.acceptToken(blockTitleToken); return;
        }
      }
      return;
    }

    // ── '[' : stemAttributeToken, admonitionAttributeToken, generic block-attr ─
    if (ch === LBRACK) {
      if (peekString(input, '[stem]')) { consumeToEOL(input); input.acceptToken(stemAttributeToken); return; }
      const admonTypes = ['[NOTE]', '[TIP]', '[WARNING]', '[IMPORTANT]', '[CAUTION]'];
      for (const admonType of admonTypes) {
        if (peekString(input, admonType)) { consumeToEOL(input); input.acceptToken(admonitionAttributeToken); return; }
      }
      // Generic block-attribute line `[source,ruby]`, `[cols="1,1"]`, `[.lead]`, … (FR-025).
      if (isBlockAttributeLine(input)) { consumeToEOL(input); input.acceptToken(blockAttributeToken); return; }
      return;
    }

    // ── Letters ───────────────────────────────────────────────────────────────
    if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122)) {
      // Conditional preprocessor directives — distinct from generic block macros (FR-051).
      for (const directive of CONDITIONAL_DIRECTIVES) {
        if (peekString(input, directive)) { consumeToEOL(input); input.acceptToken(conditionalToken); return; }
      }

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

      // `;;` description-list term separator (research D3).
      if (nameLength > 0 && input.peek(nameLength) === SEMICOLON && input.peek(nameLength + 1) === SEMICOLON) {
        consumeToEOL(input); input.acceptToken(descListToken); return;
      }
    }

    // ── Digit-starting: explicit-number ordered list, then description lists ────
    if (ch >= 48 && ch <= 57) {
      // Explicit-number ordered marker `\d+. ` (digits + dot + space) — emits the existing
      // OrderedListItem node so `1.` is highlighted like implicit `.` (research D3).
      let digits = 0;
      while (digits < 200 && input.peek(digits) >= 48 && input.peek(digits) <= 57) digits++;
      if (input.peek(digits) === DOT && input.peek(digits + 1) === SPACE) {
        for (let index = 0; index <= digits + 1; index++) input.advance();
        input.acceptToken(orderedMarker); return;
      }
      let offset = 1;
      while (offset < 200) {
        const code = input.peek(offset);
        if (code === COLON && input.peek(offset + 1) === COLON) {
          consumeToEOL(input); input.acceptToken(descListToken); return;
        }
        if (code === SEMICOLON && input.peek(offset + 1) === SEMICOLON) {
          consumeToEOL(input); input.acceptToken(descListToken); return;
        }
        if (code === NEWLINE || code === -1 || code === SPACE) break;
        offset++;
      }
    }

    // ── List / description continuation ─────────────────────────────────────────
    // The line began no block construct above. If it is non-blank and the parser is currently
    // inside a list item or description entry (i.e. it can shift a continuation line), consume
    // the whole line as the principal-text continuation. `Stack.canShift` keeps ordinary
    // paragraphs — where no continuation is expected — untouched.
    if (input.next !== NEWLINE && input.next !== -1 && stack.canShift(continuationLineToken)) {
      consumeToEOL(input);
      input.acceptToken(continuationLineToken);
    }
  },
  { contextual: true },
);
