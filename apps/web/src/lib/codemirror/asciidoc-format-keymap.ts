import { EditorView, type KeyBinding, type Command } from '@codemirror/view';
import { toggleComment } from '@codemirror/commands';

/**
 * Formatting shortcuts + auto-pair (US9, FR-036/037/041).
 *  - Mod-b / Mod-i / Mod-` wrap the selection in `*` / `_` / `` ` ``,
 *  - Mod-/ toggles a line comment,
 *  - typing an emphasis mark over a selection wraps it (auto-pair).
 * Bindings avoid clashing with save / find / undo (FR-041).
 *
 * The wrap computation is a pure helper so it unit-tests without a live editor.
 */

/** Emphasis marks eligible for type-over-selection auto-wrapping. */
export const AUTO_WRAP_MARKS = new Set(['*', '_', '`', '#', '~', '^']);

/** Wrap `selected` (or a placeholder) in `mark`; returns the inserted text + selection span. */
export function wrapWith(selected: string, mark: string, placeholder = ''): { insert: string; innerFrom: number; innerTo: number } {
  const inner = selected === '' ? placeholder : selected;
  return { insert: `${mark}${inner}${mark}`, innerFrom: mark.length, innerTo: mark.length + inner.length };
}

function wrapCommand(mark: string, placeholder: string): Command {
  return (view: EditorView) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const { insert, innerFrom, innerTo } = wrapWith(selected, mark, placeholder);
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + innerFrom, head: from + innerTo },
    });
    return true;
  };
}

/** Formatting key bindings (registered without overriding save/find/undo). */
export const formatKeymap: readonly KeyBinding[] = [
  { key: 'Mod-b', run: wrapCommand('*', 'bold'), preventDefault: true },
  { key: 'Mod-i', run: wrapCommand('_', 'italic'), preventDefault: true },
  { key: 'Mod-`', run: wrapCommand('`', 'code'), preventDefault: true },
  { key: 'Mod-/', run: toggleComment, preventDefault: true },
];

/**
 * Input handler that wraps a non-empty selection when an emphasis mark is typed
 * over it (FR-037) — e.g. select "word", press `*` → `*word*`.
 */
export const autoWrapInputHandler = EditorView.inputHandler.of((view, from, to, text) => {
  if (from === to || !AUTO_WRAP_MARKS.has(text)) return false;
  const selected = view.state.sliceDoc(from, to);
  const { insert, innerFrom, innerTo } = wrapWith(selected, text);
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + innerFrom, head: from + innerTo },
    userEvent: 'input.type',
  });
  return true;
});
