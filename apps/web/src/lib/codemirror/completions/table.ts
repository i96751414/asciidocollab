import type { CompletionSource, CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { isInsideTableBlock, getTableColumnCount } from '@/lib/codemirror/completions/table-context';

export const TABLE_SKELETON = '|===\n|Column 1 |Column 2\n\n|cell 1 |cell 2\n|===\n';

/**
 * Table skeleton completion source — triggers when "|===" is typed at column 0
 * OUTSIDE an existing table. Offers to expand into a full 2-column skeleton.
 */
export const tableSnippetCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/\|===/);
  if (!match) return null;

  // Only trigger when |=== is at column 0 (match.from equals line start)
  const line = context.state.doc.lineAt(context.pos);
  if (match.from !== line.from) return null;

  // Do not offer skeleton when already inside a table — the user is likely typing
  // the closing delimiter, and replacing it with a new skeleton would corrupt the table.
  // Check at match.from (before the |=== being typed) so we don't count the current
  // |=== as the opener of a table the cursor is already inside.
  if (isInsideTableBlock(context.state, match.from)) return null;

  const option: Completion = {
    label: 'Table skeleton',
    type: 'keyword',
    detail: '2-column table',
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: TABLE_SKELETON },
        // Place cursor at the first cell (after "Column 1 " on the header row)
        selection: { anchor: from + '|===\n|'.length },
      });
    },
  };

  return {
    from: match.from,
    options: [option],
    filter: false,
  };
};

/**
 * Table cell/row completion source — triggers when "|" is typed at line start
 * inside a table body (not on a delimiter line). Inserts a new row with the
 * correct number of cells for the current table.
 */
export const tableCellCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/\|/);
  if (!match) return null;

  // Only trigger when | is at column 0 (line start)
  const line = context.state.doc.lineAt(context.pos);
  if (match.from !== line.from) return null;

  // Only trigger inside a table block, and not on a delimiter line (|===).
  if (line.text.startsWith('|===')) return null;
  if (!isInsideTableBlock(context.state, context.pos)) return null;

  const colCount = getTableColumnCount(context.state, context.pos);
  const rowTemplate = Array.from({ length: colCount }, (_, index) => `|cell ${index + 1}`).join(' ') + '\n';

  const option: Completion = {
    label: 'New row',
    type: 'keyword',
    detail: 'insert table row',
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: rowTemplate },
        selection: { anchor: from + 1 },
      });
    },
  };

  return {
    from: match.from,
    options: [option],
    filter: false,
  };
};
