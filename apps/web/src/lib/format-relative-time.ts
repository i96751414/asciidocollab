/**
 * Formats an ISO timestamp as a short relative label such as `"2h ago"`,
 * `"yesterday"` or `"3w ago"`, suitable for compact "last updated" displays.
 *
 * @param iso - ISO 8601 timestamp to describe relative to now.
 * @param now - Reference point for "now"; defaults to the current time. Injectable for tests.
 * @returns A short human-readable label describing how long ago the timestamp was.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 45) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
