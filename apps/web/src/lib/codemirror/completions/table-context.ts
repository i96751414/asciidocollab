import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

/** Non-table delimited block names that can contain |=== in their bodies. */
const DELIMITED_BLOCK_NAMES = new Set([
  'ListingBlock', 'ExampleBlock', 'CommentBlock', 'SidebarBlock',
  'QuoteBlock', 'PassthroughBlock', 'OpenBlock', 'StemBlock',
  // Per-severity admonition delimited blocks (the tokenizer emits per-severity tokens;
  // the legacy 'AdmonitionBlock' node is never produced at runtime).
  'AdmonitionNoteBlock', 'AdmonitionTipBlock', 'AdmonitionWarningBlock',
  'AdmonitionImportantBlock', 'AdmonitionCautionBlock',
  // CSV/DSV tables are delimited blocks but NOT |-tables, so the cursor walk must
  // treat them as "not inside a |=== table" (don't offer the table skeleton/rows there).
  'CsvTableBlock', 'DsvTableBlock',
]);

/**
 * Text-based fallback: counts top-level |=== delimiters in `text`, skipping
 * lines inside other delimited blocks (----...----, ====...====, etc.).
 * Returns true when the count is odd, meaning an unclosed table is open.
 * Used for incomplete tables where Lezer hasn't yet produced a TableBlock node.
 */
function isInsideTableBlockByText(text: string): boolean {
  let currentBlockDelimiter: string | null = null;
  let tableDepth = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (currentBlockDelimiter === null) {
      // Standard delimited-block opener: 4+ of the SAME char (-, =, ., *, _, /, +)
      const m = trimmed.match(/^([-=.*_/+])\1{3,}$/);
      if (m) {
        currentBlockDelimiter = m[0];
      } else if (trimmed === '|===') {
        tableDepth++;
      }
    } else if (trimmed === currentBlockDelimiter) {
      currentBlockDelimiter = null;
    }
  }
  return tableDepth % 2 === 1;
}

/**
 * Returns true when `pos` is inside a table block.
 *
 * Strategy:
 * 1. Walk up the syntax tree. If we reach a TableBlock node → inside.
 *    If we reach another delimited block → NOT inside (prevents |=== in code
 *    blocks from being counted as a table opener).
 * 2. If the tree walk is inconclusive (incomplete table with no closing |===,
 *    so Lezer hasn't created a TableBlock node yet), fall back to text scanning.
 *    The text scan uses a state machine that skips content inside delimited
 *    blocks, avoiding false positives from |=== inside listing blocks.
 */
export function isInsideTableBlock(state: EditorState, pos: number): boolean {
  const treeCursor = syntaxTree(state).cursorAt(pos);
  do {
    if (treeCursor.name === 'TableBlock') return true;
    if (DELIMITED_BLOCK_NAMES.has(treeCursor.name)) return false;
  } while (treeCursor.parent());

  return isInsideTableBlockByText(state.doc.sliceString(0, pos));
}

/**
 * Returns the column count of the table at the cursor position.
 * Tries the syntax tree first; falls back to scanning text from the most
 * recent opening |=== delimiter.
 */
export function getTableColumnCount(state: EditorState, pos: number): number {
  // Syntax-tree path (works for complete tables)
  const treeCursor = syntaxTree(state).cursorAt(pos);
  do {
    if (treeCursor.name === 'TableBlock') {
      const tableText = state.doc.sliceString(treeCursor.from, treeCursor.to);
      for (const line of tableText.split('\n')) {
        if (line.startsWith('|') && !line.startsWith('|===')) {
          return line.split('|').length - 1;
        }
      }
      return 2;
    }
  } while (treeCursor.parent());

  // Text-based fallback (incomplete tables): find the last top-level |=== opener
  // using the same state machine as isInsideTableBlockByText.
  const textBefore = state.doc.sliceString(0, pos);
  let currentBlockDelimiter: string | null = null;
  let lastTopLevelTableOffset = -1;
  let offset = 0;
  for (const line of textBefore.split('\n')) {
    const trimmed = line.trim();
    if (currentBlockDelimiter === null) {
      const m = trimmed.match(/^([-=.*_/+])\1{3,}$/);
      if (m) {
        currentBlockDelimiter = m[0];
      } else if (trimmed === '|===') {
        lastTopLevelTableOffset = offset;
      }
    } else if (trimmed === currentBlockDelimiter) {
      currentBlockDelimiter = null;
    }
    offset += line.length + 1;
  }
  if (lastTopLevelTableOffset === -1) return 2;
  const textAfterDelim = state.doc.sliceString(lastTopLevelTableOffset);
  for (const line of textAfterDelim.split('\n').slice(1)) {
    if (line.startsWith('|') && !line.startsWith('|===')) {
      return line.split('|').length - 1;
    }
  }
  return 2;
}
