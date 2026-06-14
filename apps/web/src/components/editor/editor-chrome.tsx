'use client';
import type { EditorView } from '@codemirror/view';
import type { Awareness } from 'y-protocols/awareness';
import type { EditorThemeValue } from '@/hooks/use-editor-preferences';
import type { TableContext } from '@/lib/codemirror/asciidoc-table-context';
import { EditorToolbar } from './editor-toolbar';
import { EditorTableContextToolbar } from './editor-table-context-toolbar';
import { CollabPresenceBar } from './collab-presence-bar';

interface EditorChromeProperties {
  /** The live CodeMirror view, or null before mount; toolbars read/dispatch through it. */
  view: EditorView | null;
  /** When false the AsciiDoc toolbar and table-context toolbar are hidden (e.g. For plain-text files). */
  isAsciiDoc: boolean;
  /** Effective edit permission after observer/collab-unavailable gating. */
  canEdit: boolean;
  fontSize: number;
  theme: EditorThemeValue;
  softWrap: boolean;
  setFontSize: (size: number) => void;
  setTheme: (theme: EditorThemeValue) => void;
  setSoftWrap: (enabled: boolean) => void;
  /** Active table context, or null when the cursor is not in a table. */
  tableContext: TableContext | null;
  /** Awareness for the collab presence bar; null/undefined on the non-collab path. */
  awareness?: Awareness | null;
}

/**
 * The chrome rendered above the editor canvas: the AsciiDoc formatting toolbar, the contextual
 * table toolbar (only inside an editable table), and the collaboration presence bar. Purely
 * presentational — it wires the live view and preference setters into the toolbars.
 */
export function EditorChrome({
  view,
  isAsciiDoc,
  canEdit,
  fontSize,
  theme,
  softWrap,
  setFontSize,
  setTheme,
  setSoftWrap,
  tableContext,
  awareness,
}: EditorChromeProperties) {
  const showTableToolbar = isAsciiDoc && canEdit && tableContext !== null && view !== null;
  return (
    <>
      {isAsciiDoc && (
        <EditorToolbar
          view={view}
          canEdit={canEdit}
          fontSize={fontSize}
          theme={theme}
          softWrap={softWrap}
          setFontSize={setFontSize}
          setTheme={setTheme}
          setSoftWrap={setSoftWrap}
        />
      )}
      {showTableToolbar && view !== null && tableContext !== null && (
        <EditorTableContextToolbar
          view={view}
          context={tableContext}
          tableText={view.state.doc.sliceString(tableContext.tableFrom, tableContext.tableTo)}
          tableFrom={tableContext.tableFrom}
        />
      )}
      {awareness != null && <CollabPresenceBar awareness={awareness} />}
    </>
  );
}
