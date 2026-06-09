import { colorForUser } from './color-for-user';

/**
 * The application-supplied `user` field each client publishes over Yjs awareness
 * (contract: collab-awareness-user.md). Read by every other client to render
 * remote cursors, selection highlights, name labels, and the presence bar.
 */
export interface AwarenessUser {
  /** Stable application user id — derives the colour and dedupes tabs in the bar. */
  userId: string;
  /** Display name shown on the remote cursor label and presence bar. */
  name: string;
  /** Primary cursor/caret colour, derived deterministically from userId. */
  color: string;
  /** Lighter tint of `color` used for the selection-highlight background. */
  colorLight: string;
  /** Avatar image URL; omitted when the user has no URL avatar (falls back to a coloured initial). */
  avatarUrl?: string;
}

/** Identity inputs for the local user, sourced from the auth/profile context. */
export interface AwarenessUserIdentity {
  /** Stable application user id. */
  userId: string;
  /** Display name. */
  name: string;
  /** Optional avatar image URL. */
  avatarUrl?: string;
}

/**
 * Builds the awareness `user` field for the local client, attaching the
 * deterministic presence colours so all clients agree on a user's colour without
 * server coordination (research D9).
 */
export function buildAwarenessUser(identity: AwarenessUserIdentity): AwarenessUser {
  const { color, colorLight } = colorForUser(identity.userId);
  return {
    userId: identity.userId,
    name: identity.name,
    color,
    colorLight,
    ...(identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}),
  };
}
