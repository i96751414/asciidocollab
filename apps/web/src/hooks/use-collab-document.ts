'use client';

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import type { Awareness } from 'y-protocols/awareness';
import { COLLAB_URL, COLLAB_SYNC_TIMEOUT_MS, collabRoomName } from '@/lib/editor-config';
import { buildAwarenessUser, type AwarenessUserIdentity } from '@/lib/collab/awareness-user';

/**
 * Connection lifecycle of the collaboration provider, surfaced to the editor to
 * drive banners and read-only gating.
 */
export type ConnectionState = 'connecting' | 'synced' | 'reconnecting' | 'offline';

/**
 * The subset of HocuspocusProvider the hook depends on. Declared structurally so
 * tests can inject a lightweight fake and so the production provider satisfies it
 * without any cast.
 */
export interface CollabProvider {
  /** Awareness instance carrying presence (cursors/selection); null if disabled. */
  awareness: Awareness | null;
  /**
   * Subscribes to a provider event such as `synced` or `status`.
   *
   * @param event - The event name to listen for.
   * @param handler - Called with the event payload.
   * @returns The provider (chainable) — ignored by this hook.
   */
  on(event: string, handler: (payload?: unknown) => void): unknown;
  /**
   * Unsubscribes a previously-registered handler.
   *
   * @param event - The event name.
   * @param handler - The handler to remove.
   * @returns The provider (chainable) — ignored by this hook.
   */
  off(event: string, handler: (payload?: unknown) => void): unknown;
  /** Closes the connection and releases resources. */
  destroy(): void;
}

/** Factory that builds a provider for a room; injectable for tests. */
export type CreateCollabProvider = (arguments_: {
  url: string;
  name: string;
  document: Y.Doc;
}) => CollabProvider;

/** Inputs to {@link useCollabDocument}. */
export interface UseCollabDocumentOptions {
  /** Project id; combined with the Yjs state id to form the room name. */
  projectId: string;
  /** Yjs state id of the document to join. */
  yjsStateId: string;
  /** Only connect on the collab path; `false` keeps the hook inert (legacy/asset). */
  enabled: boolean;
  /** Local user identity published over awareness for presence; omitted = no presence. */
  user?: AwarenessUserIdentity;
  /** Overrides the provider factory in tests. */
  createProvider?: CreateCollabProvider;
}

/** Output of {@link useCollabDocument}. */
export interface UseCollabDocumentResult {
  /** The shared Y.Doc, or null when disabled/not yet created. */
  doc: Y.Doc | null;
  /** The active provider, or null when disabled. */
  provider: CollabProvider | null;
  /** The provider's awareness instance, or null when disabled. */
  awareness: Awareness | null;
  /** Current connection lifecycle state. */
  connectionState: ConnectionState;
}

const defaultCreateProvider: CreateCollabProvider = ({ url, name, document }) =>
  new HocuspocusProvider({ url, name, document });

function readStatus(payload: unknown): string | undefined {
  if (typeof payload === 'object' && payload !== null && 'status' in payload) {
    const { status } = payload;
    return typeof status === 'string' ? status : undefined;
  }
  return undefined;
}

function readSyncedState(payload: unknown): boolean {
  if (typeof payload === 'object' && payload !== null && 'state' in payload) {
    const { state } = payload;
    return state !== false;
  }
  // Some emitters fire `synced` with no payload to mean "now synced".
  return true;
}

/**
 * Owns the HocuspocusProvider + Y.Doc lifecycle for a single collaborative
 * document, keyed on (projectId, yjsStateId). The browser auto-sends the session
 * cookie on the WebSocket handshake, so no token is appended (research D5).
 *
 * Surfaces a {@link ConnectionState} derived from provider events and tears down
 * the provider, Y.Doc, and local awareness on unmount or file switch.
 */
export function useCollabDocument(options: UseCollabDocumentOptions): UseCollabDocumentResult {
  const { projectId, yjsStateId, enabled, user } = options;

  // Keep the factory in a ref so passing an inline function does not trigger
  // reconnects; the room key (projectId/yjsStateId) is the only reconnect trigger.
  const createProviderReference = useRef<CreateCollabProvider>(options.createProvider ?? defaultCreateProvider);
  createProviderReference.current = options.createProvider ?? defaultCreateProvider;

  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<CollabProvider | null>(null);
  const [awareness, setAwareness] = useState<Awareness | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');

  useEffect(() => {
    if (!enabled) {
      setYdoc(null);
      setProvider(null);
      setAwareness(null);
      return;
    }

    const sharedDocument = new Y.Doc();
    const activeProvider = createProviderReference.current({
      url: COLLAB_URL,
      name: collabRoomName(projectId, yjsStateId),
      document: sharedDocument,
    });

    let hasSynced = false;
    setYdoc(sharedDocument);
    setProvider(activeProvider);
    setAwareness(activeProvider.awareness);
    setConnectionState('connecting');

    // Publish the local user's presence identity. Cursor/selection awareness is
    // managed by y-codemirror; this is the application-supplied `user` field.
    if (user) {
      activeProvider.awareness?.setLocalStateField('user', buildAwarenessUser(user));
    }

    const handleSynced = (payload?: unknown): void => {
      if (!readSyncedState(payload)) return;
      hasSynced = true;
      clearTimeout(offlineTimer);
      setConnectionState('synced');
    };

    const handleStatus = (payload?: unknown): void => {
      const status = readStatus(payload);
      if (status === 'disconnected') {
        if (hasSynced) setConnectionState('reconnecting');
      } else if (status === 'connecting') {
        setConnectionState((previous) =>
          previous === 'offline' || (hasSynced && previous === 'reconnecting') ? previous : 'connecting',
        );
      }
    };

    activeProvider.on('synced', handleSynced);
    activeProvider.on('status', handleStatus);

    const offlineTimer = setTimeout(() => {
      if (!hasSynced) setConnectionState('offline');
    }, COLLAB_SYNC_TIMEOUT_MS);

    return () => {
      clearTimeout(offlineTimer);
      activeProvider.off('synced', handleSynced);
      activeProvider.off('status', handleStatus);
      activeProvider.awareness?.setLocalState(null);
      activeProvider.destroy();
      sharedDocument.destroy();
    };
  }, [enabled, projectId, yjsStateId]);

  // Keep the published presence identity in sync if the user's profile changes
  // mid-session. Idempotent with the on-connect set above.
  useEffect(() => {
    if (!user) return;
    awareness?.setLocalStateField('user', buildAwarenessUser(user));
  }, [awareness, user?.userId, user?.name, user?.avatarUrl]);

  return { doc: ydoc, provider, awareness, connectionState };
}
