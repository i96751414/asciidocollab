'use client';
import { useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { EditorView } from '@codemirror/view';
import { EditorToolbarButton } from './editor-toolbar-button';
import { EditorSettingsPanel } from './editor-settings-panel';
import type { EditorThemeValue } from '@/hooks/use-editor-preferences';
import { TABLE_SKELETON } from '@/lib/codemirror/asciidoc-completions';

interface EditorToolbarProperties {
  view: EditorView | null;
  canEdit?: boolean;
  fontSize?: number;
  theme?: EditorThemeValue;
  setFontSize?: (size: number) => void;
  setTheme?: (theme: EditorThemeValue) => void;
}

// Wrap selected text or insert at cursor
function wrapOrInsert(view: EditorView, before: string, after: string, placeholder = '') {
  const { from, to, empty } = view.state.selection.main;
  const selected = empty ? placeholder : view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  });
  view.focus();
}

// Insert a snippet at cursor
function insertSnippet(view: EditorView, snippet: string) {
  const { from } = view.state.selection.main;
  view.dispatch({
    changes: { from, to: from, insert: snippet },
    selection: { anchor: from + snippet.length },
  });
  view.focus();
}

// Insert a snippet at cursor with cursor positioned at a specific offset within the snippet
function insertSnippetAt(view: EditorView, snippet: string, cursorOffset: number) {
  const { from } = view.state.selection.main;
  view.dispatch({
    changes: { from, to: from, insert: snippet },
    selection: { anchor: from + cursorOffset },
  });
  view.focus();
}

// Insert a caption on the line immediately before the current cursor line
function insertCaption(view: EditorView) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const captionText = '.Block title';
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: `${captionText}\n` },
    selection: { anchor: line.from + 1, head: line.from + captionText.length },
  });
  view.focus();
}

// Insert a line-start prefix
function insertLinePrefix(view: EditorView, prefix: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
  });
  view.focus();
}

interface ToolbarAction {
  label: string;
  shortcut: string;
  icon: string;
  action: (view: EditorView) => void;
}

const TEXT_FORMATTING: ToolbarAction[] = [
  { label: 'Bold',        shortcut: 'Ctrl+B', icon: 'B',  action: (v) => wrapOrInsert(v, '*', '*', 'bold') },
  { label: 'Italic',      shortcut: 'Ctrl+I', icon: 'I',  action: (v) => wrapOrInsert(v, '_', '_', 'italic') },
  { label: 'Monospace',   shortcut: 'Ctrl+`', icon: 'M',  action: (v) => wrapOrInsert(v, '`', '`', 'code') },
  { label: 'Highlight',   shortcut: '',       icon: 'H',  action: (v) => wrapOrInsert(v, '#', '#', 'highlight') },
  { label: 'Subscript',   shortcut: '',       icon: '~',  action: (v) => wrapOrInsert(v, '~', '~', 'sub') },
  { label: 'Superscript', shortcut: '',       icon: '^',  action: (v) => wrapOrInsert(v, '^', '^', 'sup') },
];

const STRUCTURE: ToolbarAction[] = [
  { label: 'Heading 1', shortcut: '', icon: 'H1', action: (v) => insertLinePrefix(v, '= ') },
  { label: 'Heading 2', shortcut: '', icon: 'H2', action: (v) => insertLinePrefix(v, '== ') },
  { label: 'Heading 3', shortcut: '', icon: 'H3', action: (v) => insertLinePrefix(v, '=== ') },
  { label: 'Heading 4', shortcut: '', icon: 'H4', action: (v) => insertLinePrefix(v, '==== ') },
  { label: 'Heading 5', shortcut: '', icon: 'H5', action: (v) => insertLinePrefix(v, '===== ') },
  { label: 'Ordered List',   shortcut: '', icon: '1.', action: (v) => insertLinePrefix(v, '. ') },
  { label: 'Unordered List', shortcut: '', icon: '•',  action: (v) => insertLinePrefix(v, '* ') },
  { label: 'Checklist',      shortcut: '', icon: '☐',  action: (v) => insertLinePrefix(v, '* [ ] ') },
  { label: 'Description List', shortcut: '', icon: '::',action: (v) => insertLinePrefix(v, ':: ') },
];

const BLOCKS: ToolbarAction[] = [
  { label: 'Code Block',    shortcut: '', icon: '{ }', action: (v) => insertSnippet(v, '----\n\n----\n') },
  { label: 'Example Block', shortcut: '', icon: '===', action: (v) => insertSnippet(v, '====\n\n====\n') },
  { label: 'Sidebar',       shortcut: '', icon: '***', action: (v) => insertSnippet(v, '****\n\n****\n') },
  { label: 'Blockquote',    shortcut: '', icon: '"',   action: (v) => insertSnippet(v, '____\n\n____\n') },
  { label: 'NOTE',       shortcut: '', icon: 'N', action: (v) => insertSnippet(v, '[NOTE]\n====\n\n====\n') },
  { label: 'TIP',        shortcut: '', icon: 'T', action: (v) => insertSnippet(v, '[TIP]\n====\n\n====\n') },
  { label: 'WARNING',    shortcut: '', icon: 'W', action: (v) => insertSnippet(v, '[WARNING]\n====\n\n====\n') },
  { label: 'IMPORTANT',  shortcut: '', icon: '!', action: (v) => insertSnippet(v, '[IMPORTANT]\n====\n\n====\n') },
  { label: 'CAUTION',    shortcut: '', icon: 'C', action: (v) => insertSnippet(v, '[CAUTION]\n====\n\n====\n') },
  { label: 'STEM Block', shortcut: '', icon: '∑', action: (v) => insertSnippet(v, '[stem]\n++++\n\n++++\n') },
  { label: 'Comment Block', shortcut: '', icon: '//', action: (v) => insertSnippet(v, '////\n\n////\n') },
  {
    label: 'Table',
    shortcut: '',
    icon: '⊞',
    action: (v) => insertSnippetAt(v, TABLE_SKELETON, '|===\n|'.length),
  },
  {
    label: 'Caption',
    shortcut: '',
    icon: '.T',
    action: (v) => insertCaption(v),
  },
];

const INLINE_REFS: ToolbarAction[] = [
  { label: 'Link',            shortcut: '', icon: '🔗', action: (v) => insertSnippet(v, 'link:https://[label]') },
  { label: 'Cross-reference', shortcut: '', icon: '→',  action: (v) => insertSnippet(v, '<<>>') },
  { label: 'Footnote',        shortcut: '', icon: 'fn', action: (v) => insertSnippet(v, 'footnote:[text]') },
  { label: 'Image',           shortcut: '', icon: '🖼', action: (v) => insertSnippet(v, 'image::path[alt]') },
];

function ToolbarGroup({
  label, actions, view,
}: { label: string; actions: ToolbarAction[]; view: EditorView | null }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-0.5 border-r pr-1 mr-1 last:border-r-0"
    >
      {actions.map((action) => (
        <EditorToolbarButton
          key={action.label}
          icon={<span className="text-xs font-mono leading-none">{action.icon}</span>}
          label={action.label}
          shortcut={action.shortcut}
          onClick={() => view && action.action(view)}
          disabled={view === null}
        />
      ))}
    </div>
  );
}

/** Toolbar with formatting actions and editor settings. */
export function EditorToolbar({
  view,
  canEdit = true,
  fontSize = 14,
  theme = 'default',
  setFontSize = () => {},
  setTheme = () => {},
}: EditorToolbarProperties) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Tooltip.Provider>
      <div
        role="toolbar"
        aria-label="Editor toolbar"
        className="flex items-center flex-wrap gap-0 px-2 py-1 border-b bg-background"
      >
        {canEdit && (
          <>
            <ToolbarGroup label="Text Formatting"    actions={TEXT_FORMATTING} view={view} />
            <ToolbarGroup label="Structure"          actions={STRUCTURE}       view={view} />
            <ToolbarGroup label="Blocks"             actions={BLOCKS}          view={view} />
            <ToolbarGroup label="Inline/References"  actions={INLINE_REFS}     view={view} />
          </>
        )}
        <button
          type="button"
          aria-label="Editor settings"
          className="ml-auto px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setSettingsOpen((previous) => !previous)}
        >
          ⚙
        </button>
      </div>
      {settingsOpen && (
        <div className="border-b bg-background shadow-lg">
          <EditorSettingsPanel
            fontSize={fontSize}
            theme={theme}
            setFontSize={setFontSize}
            setTheme={setTheme}
          />
        </div>
      )}
    </Tooltip.Provider>
  );
}
