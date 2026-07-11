import { cn } from '@/lib/utilities';
import type { ParticipantPresence } from '@/hooks/use-collab-presence';
import { Avatar } from '@/components/avatar';

/**
 * A collaborator's avatar, rendered from their configured DiceBear key so presence surfaces match
 * the avatar shown on their review comments, wearing a ring in the collaborator's identity colour so
 * the avatar and their editor caret read as the same person. Decorative (the shared Avatar emits no
 * accessible name); the surrounding control (presence chip, file-tree marker) supplies it. Shared by
 * the in-editor presence bar and the file-tree/outline open-by-others marker so they render the same
 * user identically.
 *
 * @param participant - The collaborator to render.
 * @param size - Edge length in pixels.
 * @param className - Extra classes merged onto the wrapper (such as the cluster overlap offset).
 */
export function ParticipantAvatar({ participant, size, className = '' }: { participant: ParticipantPresence; size: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex rounded-full', className)}
      // The identity-colour ring hugs the avatar; the outer background ring separates overlapping
      // avatars in the cluster. Inline because the colour is per-user and only known at runtime.
      style={{ boxShadow: `0 0 0 2px ${participant.color}, 0 0 0 3.5px hsl(var(--background))` }}
    >
      <Avatar avatarKey={participant.avatarKey ?? null} displayName={participant.name} size={size} />
    </span>
  );
}
