'use client';

import type { ParticipantPresence } from '@/hooks/use-collab-presence';
import { ParticipantAvatar } from '@/components/collab/participant-avatar';

/** Maximum avatars rendered before collapsing the remainder into a "+N" overflow chip. */
const MAX_AVATARS = 3;

/**
 * Marks a file-tree node that is currently open by OTHER users (feature 024). Shows a small avatar
 * cluster (coloured initial fallback, matching the in-editor presence bar) and reveals who on
 * hover/focus via the accessible label + native title. Renders nothing when no other user has the
 * file open, so it never appears for the viewer's own file. Uses design tokens, so
 * it is correct in light and dark themes.
 */
export function OpenByOthersMarker({ participants }: { participants: readonly ParticipantPresence[] }) {
  if (participants.length === 0) return null;

  const names = participants.map((participant) => participant.name).join(', ');
  const label =
    participants.length === 1 ? `Open by ${names}` : `Open by ${participants.length} other users: ${names}`;
  const shown = participants.slice(0, MAX_AVATARS);
  const overflow = participants.length - shown.length;

  return (
    <span
      data-testid="open-by-others-marker"
      role="img"
      aria-label={label}
      title={names}
      tabIndex={0}
      className="flex items-center shrink-0 -space-x-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {shown.map((participant) => (
        <ParticipantAvatar key={participant.clientId} participant={participant} size={16} className="ring-1 ring-background" />
      ))}
      {overflow > 0 && <span aria-hidden="true" className="ml-1 text-[10px] text-muted-foreground">+{overflow}</span>}
    </span>
  );
}
