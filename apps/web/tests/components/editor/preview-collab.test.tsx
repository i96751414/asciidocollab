import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { collabExtensions, COLLAB_YTEXT_KEY } from '@/components/editor/editor-collab-extensions';

// M3: the preview is wired to the CodeMirror updateListener. Yjs applies remote
// changes as editor transactions, so the listener must still fire on a
// remote-origin change — otherwise the preview would go stale during collaboration.
describe('preview continuity on collab path', () => {
  test('a remote-origin Yjs change fires the updateListener with docChanged', () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const changes: string[] = [];

    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          collabExtensions(doc, awareness),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changes.push(update.state.doc.toString());
          }),
        ],
      }),
      parent,
    });

    // Simulate a remote collaborator's edit arriving via Yjs.
    doc.getText(COLLAB_YTEXT_KEY).insert(0, '== Remote section');

    expect(changes).toContain('== Remote section');

    view.destroy();
    awareness.destroy();
    doc.destroy();
  });
});
