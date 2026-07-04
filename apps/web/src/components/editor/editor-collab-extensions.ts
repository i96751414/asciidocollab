import * as Y from 'yjs';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type { Awareness } from 'y-protocols/awareness';
import { keymap } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { COLLAB_YTEXT_KEY as SHARED_COLLAB_YTEXT_KEY } from '@/lib/editor-config';

/**
 * Key of the shared `Y.Text` the editor binds to. Sourced from the dependency-free editor-config
 * (the single source of truth) and re-exported here so this module's existing importers keep working
 * without re-declaring the literal `'codemirror'`.
 */
export const COLLAB_YTEXT_KEY = SHARED_COLLAB_YTEXT_KEY;

/**
 * Builds the CodeMirror extension that binds the editor to the collaborative
 * document: `yCollab` reconciles the editor doc to `Y.Text('codemirror')`,
 * renders remote cursors/selections from awareness, and omits the local client's
 * own overlay.
 *
 * Per-user undo: a `Y.UndoManager` with empty `trackedOrigins` — the
 * y-codemirror undo plugin adds the local sync origin automatically, so undo
 * reverts only this user's edits, never a remote peer's. `yUndoManagerKeymap`
 * binds Mod-z/Mod-y; native CodeMirror history is omitted on the collab path
 * (see `useEditorMount`) to avoid double-undo (research D10).
 *
 * @param ydoc - The shared Y.Doc owned by `useCollabDocument`.
 * @param awareness - The provider's awareness instance.
 * @returns The assembled CodeMirror extension for the collab path.
 */
export function collabExtensions(ydoc: Y.Doc, awareness: Awareness): Extension {
  const ytext = ydoc.getText(COLLAB_YTEXT_KEY);
  const undoManager = new Y.UndoManager(ytext, { trackedOrigins: new Set() });
  return [yCollab(ytext, awareness, { undoManager }), keymap.of(yUndoManagerKeymap)];
}
