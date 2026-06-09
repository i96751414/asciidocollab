import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { yUndoManagerKeymap } from 'y-codemirror.next';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { collabExtensions, COLLAB_YTEXT_KEY } from '@/components/editor/editor-collab-extensions';

function mount(doc: Y.Doc, awareness: Awareness) {
  const parent = document.createElement('div');
  document.body.append(parent);
  return new EditorView({
    state: EditorState.create({ doc: '', extensions: [collabExtensions(doc, awareness)] }),
    parent,
  });
}

function runUndo(view: EditorView): void {
  const binding = yUndoManagerKeymap.find((b) => b.key === 'Mod-z');
  if (binding?.run) binding.run(view);
}

// US3 / FR-011: per-user undo. The Yjs UndoManager tracks only the local sync
// origin, so undo reverts the local user's own edits and never a remote peer's.
describe('collaborative per-user undo', () => {
  test('undo reverts the local edit but leaves a remote-origin edit untouched', () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const view = mount(doc, awareness);
    const ytext = doc.getText(COLLAB_YTEXT_KEY);

    // A remote peer inserts text (a non-local Yjs origin) — must NOT be undoable here.
    doc.transact(() => ytext.insert(0, 'REMOTE '), 'remote-peer');
    // The local user types via the editor (the y-codemirror sync origin) — undoable.
    view.dispatch({ changes: { from: ytext.length, insert: 'LOCAL' } });
    expect(ytext.toString()).toBe('REMOTE LOCAL');

    runUndo(view);

    // Only the local edit is reverted; the remote peer's text remains.
    expect(ytext.toString()).toBe('REMOTE ');

    view.destroy();
    awareness.destroy();
    doc.destroy();
  });

  test('undo with only remote-origin changes is a no-op for the local user', () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const view = mount(doc, awareness);
    const ytext = doc.getText(COLLAB_YTEXT_KEY);

    doc.transact(() => ytext.insert(0, 'remote only'), 'remote-peer');
    expect(ytext.toString()).toBe('remote only');

    runUndo(view);

    expect(ytext.toString()).toBe('remote only');

    view.destroy();
    awareness.destroy();
    doc.destroy();
  });
});
