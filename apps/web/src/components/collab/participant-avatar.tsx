import Image from 'next/image';
import type { ParticipantPresence } from '@/hooks/use-collab-presence';

/** First letter of a display name, used as the avatar fallback. */
export function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

/**
 * A collaborator's avatar: their image when available, otherwise a colour-coded initial. Decorative
 * (`aria-hidden`) — the surrounding control (presence chip, file-tree marker) supplies the accessible
 * name. Shared by the in-editor presence bar and the file-tree open-by-others marker so they render
 * the same user identically.
 *
 * @param participant - The collaborator to render.
 * @param size - Edge length in pixels.
 * @param className - Extra classes (such as an overlap ring) merged onto the avatar element.
 */
export function ParticipantAvatar({ participant, size, className = '' }: { participant: ParticipantPresence; size: number; className?: string }) {
  if (participant.avatarUrl) {
    // `unoptimized`: avatar URLs are arbitrary external hosts (not enumerable in next.config
    // `images.remotePatterns`), so bypass the optimizer — same convention as image-preview.tsx.
    return (
      <Image
        src={participant.avatarUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        className={`rounded-full ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ backgroundColor: participant.color, width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {initialOf(participant.name)}
    </span>
  );
}
