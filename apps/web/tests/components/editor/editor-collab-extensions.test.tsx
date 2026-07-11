import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { collabExtensions, COLLAB_YTEXT_KEY } from '@/components/editor/editor-collab-extensions';

// The remote-caret widget embeds a DiceBear avatar; stub the generator so this suite stays in jsdom
// (real DiceBear needs structuredClone) and the avatar is queryable.
jest.mock('@/lib/avatar-svg', () => ({
  buildAvatarSvg: (avatarKey: string | null, name: string) => `<svg data-testid="stub-avatar" data-name="${name}"></svg>`,
}));

function mountCollabEditor(doc: Y.Doc, awareness: Awareness) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    // B3: collab editor mounts with an EMPTY doc; content arrives via Yjs.
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

  test("draws a remote peer's caret with their avatar, then clears it when they leave", () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const view = mountCollabEditor(doc, awareness);
    const ytext = doc.getText(COLLAB_YTEXT_KEY);
    ytext.insert(0, 'hello world');

    // Inject another client's selection (relative positions resolve against the shared text). Emitting
    // the awareness change drives yCollab's stock remote-selections plugin to dispatch a transaction,
    // which is what repaints our carets — no separate awareness listener of our own (that would re-enter
    // an in-progress update). So the caret appears synchronously after the emit.
    const remoteId = doc.clientID + 1;
    awareness.states.set(remoteId, {
      user: { color: '#8a5cff', name: 'Ada', avatarKey: 'bottts:2', colorLight: '#8a5cff33' },
      cursor: {
        anchor: Y.createRelativePositionFromTypeIndex(ytext, 2),
        head: Y.createRelativePositionFromTypeIndex(ytext, 6),
      },
    });
    awareness.emit('change', [{ added: [remoteId], updated: [], removed: [] }, 'local']);

    const caret = view.dom.querySelector<HTMLElement>('.cm-remoteCaret');
    expect(caret).not.toBeNull();
    expect(caret!.style.getPropertyValue('--remote-color')).toBe('#8a5cff');
    expect(caret!.querySelector('.cm-remoteCaret-name')?.textContent).toBe('Ada');
    expect(caret!.querySelector('.cm-remoteCaret-avatar svg')).not.toBeNull();

    // The peer disconnects → the caret is repainted away on the next awareness change.
    awareness.states.delete(remoteId);
    awareness.emit('change', [{ added: [], updated: [], removed: [remoteId] }, 'local']);
    expect(view.dom.querySelector('.cm-remoteCaret')).toBeNull();

    view.destroy();
    awareness.destroy();
    doc.destroy();
  });
});
