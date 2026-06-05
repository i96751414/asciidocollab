import { StateField } from '@codemirror/state';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import type { EditorState, Transaction } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';

/** An entry in the section outline panel. */
export interface SectionOutlineEntry {
  /** Heading level (1–5). */
  level: number;
  /** Heading title text. */
  title: string;
  /** Line number of the heading. */
  line: number;
  /** Document offset of the heading node start. */
  from: number;
}

/** Maps grammar node names to heading levels. */
const HEADING_NODE_LEVELS: Record<string, number> = {
  Heading1: 1,
  Heading2: 2,
  Heading3: 3,
  Heading4: 4,
  Heading5: 5,
};

function extractHeadings(state: EditorState): SectionOutlineEntry[] {
  const entries: SectionOutlineEntry[] = [];
  const tree = ensureSyntaxTree(state, state.doc.length) ?? syntaxTree(state);

  tree.cursor().iterate((node: SyntaxNodeRef) => {
    const level = HEADING_NODE_LEVELS[node.type.name];
    if (level === undefined) return;

    const lineObject = state.doc.lineAt(node.from);
    const rawLine = lineObject.text;

    const prefixMatch = rawLine.match(/^={1,6} /);
    const title = prefixMatch ? rawLine.slice(prefixMatch[0].length) : rawLine;

    entries.push({
      level,
      title: title.trim(),
      line: lineObject.number,
      from: node.from,
    });
  });

  return entries;
}

/** CM6 StateField that tracks the current section outline from the Lezer parse tree. */
export const outlineField = StateField.define<SectionOutlineEntry[]>({
  create(state: EditorState) {
    return extractHeadings(state);
  },
  update(entries: SectionOutlineEntry[], tr: Transaction) {
    if (!tr.docChanged) return entries;
    return extractHeadings(tr.state);
  },
});
