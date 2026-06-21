'use client';

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { presenceRoomName } from '@asciidocollab/shared';
import { COLLAB_URL } from '@/lib/editor-config';
import { buildAwarenessUser, type AwarenessUser, type AwarenessUserIdentity } from '@/lib/collab/awareness-user';
import type { ParticipantPresence } from '@/hooks/use-collab-presence';

/** Awareness state each client publishes into the project presence room. */
interface PresenceState {
  /** Identity of the publishing user (avatar/name/colour). */
  user?: AwarenessUser;
  /** File node id the publishing user currently has open, or null when none. */
  openFileNodeId?: string | null;
  /**
   * 1-based cursor line in the open file (FR-019). Absent for older clients that don't publish it.
   * Consumers skip it when absent rather than treating it as line 0.
   */
  cursorLine?: number;
}

/**
 * The subset of y-protocols Awareness the presence hook needs. Declared structurally so tests can
 * inject a fake and the real Awareness satisfies it.
 */
export interface PresenceAwareness {
  /** The local client's awareness id. */
  clientID: number;
  /**
   * Returns all known client states keyed by client id.
   *
   * @returns A map of awareness client id to its published presence state.
   */
  getStates(): Map<number, PresenceState>;
  /**
   * Publishes a single field of the local client's awareness state.
   *
   * @param field - The state field name.
   * @param value - The value to publish.
   */
  setLocalStateField(field: string, value: unknown): void;
  /**
   * Replaces or clears the local client's awareness state.
   *
   * @param state - The new state, or null to clear it.
   */
  setLocalState(state: unknown): void;
  /**
   * Subscribes to awareness changes.
   *
   * @param event - The awareness event name (e.g. `change`).
   * @param handler - Called when awareness state changes.
   */
  on(event: string, handler: () => void): void;
  /**
   * Unsubscribes a handler.
   *
   * @param event - The awareness event name.
   * @param handler - The handler to remove.
   */
  off(event: string, handler: () => void): void;
}

/** The subset of the provider the presence hook needs. */
export interface PresenceProvider {
  /** Awareness instance carrying presence; null if disabled. */
  awareness: PresenceAwareness | null;
  /** Closes the connection and releases resources. */
  destroy(): void;
}

/** Factory that builds a presence-room provider; injectable for tests. */
export type CreatePresenceProvider = (arguments_: { url: string; name: string; document: Y.Doc }) => PresenceProvider;

const defaultCreatePresenceProvider: CreatePresenceProvider = ({ url, name, document }) =>
  new HocuspocusProvider({ url, name, document });

/** Inputs to {@link useProjectPresence}. */
export interface UseProjectPresenceOptions {
  /** Project whose presence room to join. */
  projectId: string;
  /** Whether to connect; `false` keeps the hook inert and returns an empty map. */
  enabled: boolean;
  /** Local user identity to publish; omitted = do not connect (nothing to attribute). */
  user?: AwarenessUserIdentity;
  /** The file the viewer currently has open, or null. Published so others' trees can mark it. */
  openFileNodeId: string | null;
  /**
   * 1-based line where the local user's cursor sits in the open file. Published via awareness
   * (debounced ~300 ms) so collaborators can attribute cursor positions to outline headings
   * (FR-019/FR-023). Absent or null ⇒ no cursor-line entry published.
   */
  cursorLine?: number | null;
  /** Overrides the provider factory in tests. */
  createProvider?: CreatePresenceProvider;
}

/**
 * Reduces all peers' awareness into other-users-per-file: excludes the local user — both this tab
 * and the same user's other tabs/devices (FR-003) — and dedupes a user across tabs per file (FR-009).
 *
 * @param awareness - The presence-room awareness.
 * @param localUserId - The viewer's user id, so their own other tabs are not reported as "others".
 * @returns A map of file node id to the other participants holding that file open.
 */
function collectByFile(awareness: PresenceAwareness, localUserId: string): Map<string, ParticipantPresence[]> {
  const byFile = new Map<string, ParticipantPresence[]>();
  const seenPerFile = new Map<string, Set<string>>();
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue;
    const { user, openFileNodeId } = state;
    if (!user || !openFileNodeId) continue;
    if (user.userId === localUserId) continue; // the viewer's own other tab is not an "other" user
    let seen = seenPerFile.get(openFileNodeId);
    if (!seen) {
      seen = new Set();
      seenPerFile.set(openFileNodeId, seen);
    }
    if (seen.has(user.userId)) continue;
    seen.add(user.userId);
    const list = byFile.get(openFileNodeId) ?? [];
    list.push({
      clientId,
      userId: user.userId,
      name: user.name,
      color: user.color,
      colorLight: user.colorLight,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      ...(typeof state.cursorLine === 'number' ? { cursorLine: state.cursorLine } : {}),
    });
    byFile.set(openFileNodeId, list);
  }
  return byFile;
}

/** True when two file→participants maps are equivalent (same files, same users+names per file). */
function byFileEqual(a: Map<string, ParticipantPresence[]>, b: Map<string, ParticipantPresence[]>): boolean {
  if (a.size !== b.size) return false;
  for (const [file, listA] of a) {
    const listB = b.get(file);
    if (!listB || listB.length !== listA.length) return false;
    for (const [index, participant] of listA.entries()) {
      if (participant.userId !== listB[index].userId || participant.name !== listB[index].name) return false;
      // Compare cursorLine too: a peer moving their cursor changes only this field, and the outline
      // attributes presence markers by it (FR-021). Without this, a cursor move is suppressed as a
      // no-op and the marker never appears / never moves.
      if (participant.cursorLine !== listB[index].cursorLine) return false;
    }
  }
  return true;
}

/**
 * Joins the project presence room (a lightweight awareness-only Hocuspocus room) to publish which
 * file the viewer has open and observe which files OTHER users have open. Returns a map of
 * fileNodeId → the other participants holding that file open, updated in near-real-time and cleared
 * automatically when a peer disconnects. Presence is awareness-only: it never writes shared document
 * content (FR-011).
 */
export function useProjectPresence(options: UseProjectPresenceOptions): ReadonlyMap<string, ParticipantPresence[]> {
  const { projectId, enabled, user, openFileNodeId, cursorLine, createProvider } = options;
  const userId = user?.userId;
  const name = user?.name;
  const avatarUrl = user?.avatarUrl;

  const [byFile, setByFile] = useState<Map<string, ParticipantPresence[]>>(() => new Map());
  // Updated every render (mirrors use-collab-document) so a factory swapped after mount is honoured.
  const createProviderReference = useRef<CreatePresenceProvider>(defaultCreatePresenceProvider);
  createProviderReference.current = createProvider ?? defaultCreatePresenceProvider;
  const awarenessReference = useRef<PresenceAwareness | null>(null);
  // The latest open file, read by the connect effect so a reconnect republishes it without waiting
  // for the next file switch.
  const openFileNodeIdReference = useRef(openFileNodeId);
  openFileNodeIdReference.current = openFileNodeId;

  // Connect once per (project, identity). Re-derives identity from primitives so a fresh `user`
  // object each render does not cause a reconnect loop.
  useEffect(() => {
    if (!enabled || !userId || !name) {
      setByFile(new Map());
      return;
    }
    const document = new Y.Doc();
    const provider = createProviderReference.current({ url: COLLAB_URL, name: presenceRoomName(projectId), document });
    const awareness = provider.awareness;
    awarenessReference.current = awareness;
    if (!awareness) {
      return () => {
        provider.destroy();
        document.destroy();
      };
    }

    const identity: AwarenessUserIdentity = { userId, name, ...(avatarUrl ? { avatarUrl } : {}) };
    awareness.setLocalStateField('user', buildAwarenessUser(identity));
    // Republish the current open file on (re)connect so a fresh awareness advertises it immediately.
    awareness.setLocalStateField('openFileNodeId', openFileNodeIdReference.current);
    const update = (): void => {
      const next = collectByFile(awareness, userId);
      // Avoid re-rendering the whole tree when the open-file mapping is unchanged (awareness fires
      // 'change' for unrelated state too).
      setByFile((previous) => (byFileEqual(previous, next) ? previous : next));
    };
    update();
    awareness.on('change', update);
    return () => {
      awareness.off('change', update);
      awareness.setLocalState(null);
      awarenessReference.current = null;
      provider.destroy();
      document.destroy();
    };
  }, [enabled, projectId, userId, name, avatarUrl]);

  // Publish the file the viewer currently has open whenever it changes. The local change only
  // affects what OTHERS see (the viewer's own entry is excluded from `byFile`), so the awareness
  // 'change' listener — guarded by byFileEqual — handles any needed re-render; no recompute here.
  useEffect(() => {
    awarenessReference.current?.setLocalStateField('openFileNodeId', openFileNodeId);
  }, [openFileNodeId]);

  // Publish cursorLine debounced (~300 ms) so every keystroke doesn't spam awareness (FR-019).
  // When cursorLine becomes null (file switch), immediately clear the field from awareness so peers
  // don't see a stale marker from the previous file (the open-file marker updates in parallel).
  useEffect(() => {
    if (cursorLine == null) {
      awarenessReference.current?.setLocalStateField('cursorLine', undefined);
      return;
    }
    const timer = setTimeout(() => {
      awarenessReference.current?.setLocalStateField('cursorLine', cursorLine);
    }, 300);
    return () => clearTimeout(timer);
  }, [cursorLine]);

  return byFile;
}
