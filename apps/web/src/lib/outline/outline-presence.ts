import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import type { ParticipantPresence } from '@/hooks/use-collab-presence';

/** A presence peer who has published a `cursorLine` field via Yjs awareness (FR-019). */
export interface OutlinePeer extends ParticipantPresence {
  /** 1-based cursor line published by the peer via awareness (FR-019). */
  cursorLine: number;
}

/**
 * Maps peers' cursor positions to the nearest preceding outline heading in their source file.
 *
 * Each peer is attributed to the heading whose `sourceLine` is the greatest value ≤ `cursorLine`
 * within the same `sourceFileId`. Peers with `cursorLine ≤ 0`, with a cursorLine above the first
 * heading in their file, or belonging to a file not present in `entries` are silently dropped
 * (Principle IX / FR-024). Per-user deduplication is assumed to happen at the caller level
 * (collectByFile already dedupes by user across tabs).
 *
 * @param entries - Full outline with provenance (sourceFileId, sourceLine required).
 * @param peersByFile - Map of fileId → peers with valid, already-deduplicated cursorLine values.
 * @returns Map keyed by `${sourceFileId}:${sourceLine}` → peers at that heading.
 */
export function mapOutlinePresence(
  entries: SectionOutlineEntry[],
  peersByFile: Map<string, OutlinePeer[]>,
): Map<string, ParticipantPresence[]> {
  if (peersByFile.size === 0 || entries.length === 0) return new Map();

  // Build a per-file index of headings sorted by sourceLine for binary search.
  const headingsByFile = new Map<string, { sourceLine: number; key: string }[]>();
  for (const entry of entries) {
    if (!entry.sourceFileId || entry.sourceLine === undefined) continue;
    let list = headingsByFile.get(entry.sourceFileId);
    if (!list) {
      list = [];
      headingsByFile.set(entry.sourceFileId, list);
    }
    list.push({ sourceLine: entry.sourceLine, key: `${entry.sourceFileId}:${entry.sourceLine}` });
  }
  // Ensure sorted by sourceLine (entries should already be in order, but be defensive).
  for (const list of headingsByFile.values()) {
    list.sort((a, b) => a.sourceLine - b.sourceLine);
  }

  const result = new Map<string, ParticipantPresence[]>();

  for (const [fileId, peers] of peersByFile) {
    const headings = headingsByFile.get(fileId);
    if (!headings || headings.length === 0) continue;

    for (const peer of peers) {
      const line = peer.cursorLine;
      if (!Number.isFinite(line) || line <= 0) continue; // Principle IX: clamp invalid values

      // Find the nearest heading at or before the cursor line (binary search).
      let lo = 0, hi = headings.length - 1, bestIndex = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (headings[mid].sourceLine <= line) {
          bestIndex = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (bestIndex < 0) continue; // cursor is above the first heading — skip

      const key = headings[bestIndex].key;
      let list = result.get(key);
      if (!list) {
        list = [];
        result.set(key, list);
      }
      list.push(peer);
    }
  }

  return result;
}
