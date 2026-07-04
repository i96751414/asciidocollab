import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { collabExtensions, COLLAB_YTEXT_KEY } from '@/components/editor/editor-collab-extensions';

// Research D8: an observer's editor is read-only
// (EditorState.readOnly + EditorView.editable false), yet remote (Yjs-applied)
// updates still flow in so observers see live edits.
function mountReadOnly(doc: Y.Doc, awareness: Awareness) {
  const parent = document.createElement('div');
  document.body.append(parent);
  return new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        collabExtensions(doc, awareness),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    }),
    parent,
  });
}

describe('observer read-only collab editor', () => {
  test('configures the editor as read-only and non-editable', () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const view = mountReadOnly(doc, awareness);

    expect(view.state.readOnly).toBe(true);
    expect(view.state.facet(EditorView.editable)).toBe(false);

    view.destroy();
    awareness.destroy();
    doc.destroy();
  });

  test('still applies remote Yjs updates so the observer sees live edits', () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const view = mountReadOnly(doc, awareness);

    doc.getText(COLLAB_YTEXT_KEY).insert(0, 'live remote content');
    expect(view.state.doc.toString()).toBe('live remote content');

    view.destroy();
    awareness.destroy();
    doc.destroy();
  });
});
