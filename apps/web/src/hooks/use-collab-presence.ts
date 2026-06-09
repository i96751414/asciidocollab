'use client';

import { useEffect, useState } from 'react';
import type { AwarenessUser } from '@/lib/collab/awareness-user';

/** A connected collaborator derived from a Yjs awareness entry. */
export interface ParticipantPresence {
  /** Yjs awareness client id (per-tab). */
  clientId: number;
  /** Stable application user id. */
  userId: string;
  /** Display name. */
  name: string;
  /** Primary presence colour. */
  color: string;
  /** Lighter selection-highlight tint. */
  colorLight: string;
  /** Avatar image URL, if any. */
  avatarUrl?: string;
}

/**
 * The subset of y-protocols Awareness the presence hook depends on. Declared
 * structurally so tests can inject a fake and the real Awareness satisfies it.
 */
export interface AwarenessLike {
  /** The local client's awareness id. */
  clientID: number;
  /**
   * Returns all known client states keyed by client id.
   *
   * @returns A map of awareness client id to its published state.
   */
  getStates(): Map<number, { user?: AwarenessUser }>;
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

function collectParticipants(awareness: AwarenessLike): ParticipantPresence[] {
  const seen = new Set<string>();
  const participants: ParticipantPresence[] = [];
  for (const [clientId, state] of awareness.getStates()) {
    // A client MUST NOT render its own overlay/entry (FR-008).
    if (clientId === awareness.clientID) continue;
    const { user } = state;
    if (!user) continue;
    // Dedupe the same application user across tabs to a single identity (FR-010).
    if (seen.has(user.userId)) continue;
    seen.add(user.userId);
    participants.push({
      clientId,
      userId: user.userId,
      name: user.name,
      color: user.color,
      colorLight: user.colorLight,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    });
  }
  return participants;
}

/**
 * Subscribes to Yjs awareness and returns the other participants (the local
 * client excluded, tabs of the same user deduped). Updates as peers join/leave.
 */
export function useCollabPresence(awareness: AwarenessLike | null): ParticipantPresence[] {
  const [participants, setParticipants] = useState<ParticipantPresence[]>([]);

  useEffect(() => {
    if (!awareness) {
      setParticipants([]);
      return;
    }
    const update = (): void => setParticipants(collectParticipants(awareness));
    update();
    awareness.on('change', update);
    return () => awareness.off('change', update);
  }, [awareness]);

  return participants;
}
