import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { collabExtensions, COLLAB_YTEXT_KEY } from '@/components/editor/editor-collab-extensions';

function mountCollabEditor(doc: Y.Doc, awareness: Awareness) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    // FR-004/B3: collab editor mounts with an EMPTY doc; content arrives via Yjs.
    state: EditorState.create({ doc: '', extensions: [collabExtensions(doc, awareness)] }),
    parent,
  });
  return view;
}

describe('collabExtensions', () => {
  test('mounts empty and is populated from the bound Y.Text("codemirror")', () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const view = mountCollabEditor(doc, awareness);

    expect(view.state.doc.toString()).toBe('');

    // A remote (Yjs-origin) insertion flows into the editor without REST seeding.
    doc.getText(COLLAB_YTEXT_KEY).insert(0, '= Hello from Yjs');
    expect(view.state.doc.toString()).toBe('= Hello from Yjs');

    view.destroy();
    awareness.destroy();
    doc.destroy();
  });

  test('local editor edits propagate into the shared Y.Text', () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const view = mountCollabEditor(doc, awareness);

    view.dispatch({ changes: { from: 0, insert: 'typed locally' } });
    expect(doc.getText(COLLAB_YTEXT_KEY).toString()).toBe('typed locally');

    view.destroy();
    awareness.destroy();
    doc.destroy();
  });
});
