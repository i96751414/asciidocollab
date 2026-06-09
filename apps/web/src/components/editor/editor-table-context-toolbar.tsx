'use client';
import React from 'react';
import {
  ArrowUpToLine, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine,
  ArrowLeft, ArrowRight, FoldVertical, FoldHorizontal, AlignJustify,
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { EditorView } from '@codemirror/view';
import { tableContextField } from '@/lib/codemirror/asciidoc-table-context';
import type { TableContext } from '@/lib/codemirror/asciidoc-table-context';
import {
  addRow,
  removeRow,
  addColumn,
  removeColumn,
  moveColumn,
  formatTable,
  checkSpanConflict,
  type TableOpResult,
} from '@/lib/codemirror/asciidoc-table-operations';
import { EditorToolbarButton } from './editor-toolbar-button';

interface Properties {
  view: EditorView;
  context: TableContext;
  tableText: string;
  tableFrom: number;
}

interface TableAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled: boolean;
  disabledReason?: string;
  action: () => void;
}

/** Contextual toolbar rendered above the editor when the cursor is inside an AsciiDoc table. */
export function EditorTableContextToolbar({ view, context, tableText, tableFrom }: Properties) {
  const { cursorRowIndex, cursorColumnIndex, rowCount, columnCount, isInHeader } = context;

  function dispatchOp(op: (text: string) => string | TableOpResult<string>) {
    let from: number;
    let to: number;
    let liveText: string;

    try {
      const liveContext = view.state.field(tableContextField);
      if (!liveContext) throw new Error('no context');
      from = liveContext.tableFrom;
      to = liveContext.tableTo;
      liveText = view.state.doc.sliceString(from, to);
    } catch {
      from = tableFrom;
      to = context.tableTo;
      liveText = tableText;
    }

    const opResult = op(liveText);
    const newText = typeof opResult === 'string' ? opResult : (opResult.ok ? opResult.value : null);
    if (newText === null) return;
    view.dispatch({ changes: { from, to, insert: newText } });
    view.focus();
  }

  const hasSpanAtCursor = checkSpanConflict(tableText, cursorColumnIndex);
  const hasSpanAtLeft = cursorColumnIndex > 0 && checkSpanConflict(tableText, cursorColumnIndex, cursorColumnIndex - 1);
  const hasSpanAtRight = cursorColumnIndex < columnCount - 1 && checkSpanConflict(tableText, cursorColumnIndex, cursorColumnIndex + 1);

  const actions: TableAction[] = [
    {
      label: 'Add Row Above',
      icon: ArrowUpToLine,
      disabled: false,
      action: () => dispatchOp((text) => addRow(text, cursorRowIndex - 1)),
    },
    {
      label: 'Add Row Below',
      icon: ArrowDownToLine,
      disabled: false,
      action: () => dispatchOp((text) => addRow(text, isInHeader ? -1 : cursorRowIndex)),
    },
    {
      label: 'Remove Row',
      icon: FoldVertical,
      disabled: isInHeader || rowCount <= 1,
      disabledReason: isInHeader
        ? 'Cannot remove the header row'
        : (rowCount <= 1 ? 'Cannot remove the last row' : undefined),
      action: () => dispatchOp((text) => removeRow(text, cursorRowIndex)),
    },
    {
      label: 'Add Column Left',
      icon: ArrowLeftToLine,
      disabled: false,
      action: () => dispatchOp((text) => addColumn(text, cursorColumnIndex, true)),
    },
    {
      label: 'Add Column Right',
      icon: ArrowRightToLine,
      disabled: false,
      action: () => dispatchOp((text) => addColumn(text, cursorColumnIndex, false)),
    },
    {
      label: 'Remove Column',
      icon: FoldHorizontal,
      disabled: columnCount <= 1 || hasSpanAtCursor,
      disabledReason: columnCount <= 1
        ? 'Cannot remove the last column'
        : (hasSpanAtCursor
        ? `Column ${cursorColumnIndex + 1} is affected by a spanning cell`
        : undefined),
      action: () => dispatchOp((text) => removeColumn(text, cursorColumnIndex)),
    },
    {
      label: 'Move Column Left',
      icon: ArrowLeft,
      disabled: columnCount <= 1 || cursorColumnIndex === 0 || hasSpanAtLeft,
      disabledReason: cursorColumnIndex === 0 ? 'Already at first column' : undefined,
      action: () => dispatchOp((text) => moveColumn(text, cursorColumnIndex, 'left')),
    },
    {
      label: 'Move Column Right',
      icon: ArrowRight,
      disabled: columnCount <= 1 || cursorColumnIndex >= columnCount - 1 || hasSpanAtRight,
      disabledReason: cursorColumnIndex >= columnCount - 1 ? 'Already at last column' : undefined,
      action: () => dispatchOp((text) => moveColumn(text, cursorColumnIndex, 'right')),
    },
    {
      label: 'Format Table',
      icon: AlignJustify,
      disabled: false,
      action: () => dispatchOp((text) => formatTable(text)),
    },
  ];

  return (
    <Tooltip.Provider>
      <div
        role="toolbar"
        aria-label="Table context toolbar"
        className="flex items-center flex-wrap gap-0 px-2 py-0.5 border-b bg-muted/30"
      >
        {actions.map((action) => (
          <EditorToolbarButton
            key={action.label}
            icon={<action.icon className="h-4 w-4" />}
            label={action.label}
            shortcut={action.disabledReason ?? ''}
            onClick={action.action}
            disabled={action.disabled}
          />
        ))}
      </div>
    </Tooltip.Provider>
  );
}
