'use client';

import { useCollabPresence, type AwarenessLike, type ParticipantPresence } from '@/hooks/use-collab-presence';
import { ParticipantAvatar } from '@/components/collab/participant-avatar';

interface CollabPresenceBarProperties {
  /** The provider awareness, or null on the legacy/offline path. */
  awareness: AwarenessLike | null;
}

/** A single participant chip: avatar (or coloured initial) plus name. */
function ParticipantChip({ participant }: { participant: ParticipantPresence }) {
  return (
    <span
      data-testid="collab-presence-participant"
      className="flex items-center gap-1.5 rounded-full bg-muted/60 pl-0.5 pr-2 py-0.5 text-xs"
      title={participant.name}
    >
      <ParticipantAvatar participant={participant} size={20} />
      <span>{participant.name}</span>
    </span>
  );
}

/**
 * Shows the other collaborators currently in the document (FR-010): one chip per
 * distinct user with an avatar or coloured initial, plus a count. Renders nothing
 * when alone or off the collab path.
 */
export function CollabPresenceBar({ awareness }: CollabPresenceBarProperties) {
  const participants = useCollabPresence(awareness);

  if (participants.length === 0) return null;

  return (
    <div
      data-testid="collab-presence-bar"
      className="flex items-center gap-1.5 px-2 py-1 border-b text-muted-foreground"
    >
      {participants.map((participant) => (
        <ParticipantChip key={participant.clientId} participant={participant} />
      ))}
      <span data-testid="collab-presence-count" className="ml-1 text-xs tabular-nums">
        {participants.length}
      </span>
    </div>
  );
}
