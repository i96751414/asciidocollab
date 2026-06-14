import type * as Y from 'yjs';
import type { Hocuspocus } from '@hocuspocus/server';
import type { ContentReplacement } from '@asciidocollab/domain';

/** The Y.Text name the CodeMirror binding (and persistence) uses for document content. */
const CODEMIRROR_TEXT = 'codemirror';

/** A request to apply literal reference rewrites to one collaborative document. */
export interface ApplyEditsRequest {
  /** Project that owns the document. */
  projectId: string;
  /** Yjs state identifier — identifies the document's collaboration room. */
  yjsStateId: string;
  /** Literal find→replace deltas to apply to the document text. */
  replacements: ContentReplacement[];
}

/**
 * Applies literal find→replace deltas to a Y.Text in place. MUST be called inside a Yjs
 * transaction. Every occurrence of each `find` is replaced; the string is re-read after each
 * splice so offsets stay valid, and the scan resumes past the inserted text so a `replace` that
 * contains `find` cannot loop forever. A `find` that is absent (or equal to `replace`, or empty)
 * is skipped — making the operation a safe no-op when the live text has already diverged.
 *
 * @param ytext - The Y.Text to mutate.
 * @param replacements - The deltas to apply.
 * @returns The number of individual occurrences replaced.
 */
export function applyReplacementsToYText(
  ytext: Y.Text,
  replacements: ReadonlyArray<ContentReplacement>,
): number {
  let applied = 0;
  for (const { find, replace } of replacements) {
    if (find.length === 0 || find === replace) continue;
    let searchFrom = 0;
    for (;;) {
      const current = ytext.toString();
      const index = current.indexOf(find, searchFrom);
      if (index === -1) break;
      ytext.delete(index, find.length);
      ytext.insert(index, replace);
      applied += 1;
      searchFrom = index + replace.length;
    }
  }
  return applied;
}

/**
 * Applies reference rewrites to the live collaborative document identified by the request, via a
 * server-side direct connection. `openDirectConnection` attaches to a room that is already open
 * (so connected editors see the change immediately) or loads a dormant one from its authoritative
 * Yjs state — never from the possibly-stale plain-text file. The edit is applied in a transaction;
 * `disconnect()` forces the normal writeback (persisting the corrected Yjs state AND plain text)
 * and unloads the room if no one else is connected.
 *
 * @param hocuspocus - The Hocuspocus instance owning the live documents.
 * @param request - The document identity and the replacements to apply.
 * @returns The number of occurrences replaced.
 */
export async function applyEditsToDocument(
  hocuspocus: Pick<Hocuspocus, 'openDirectConnection'>,
  request: ApplyEditsRequest,
): Promise<number> {
  const roomName = `${request.projectId}/${request.yjsStateId}`;
  const connection = await hocuspocus.openDirectConnection(roomName);
  let applied = 0;
  try {
    await connection.transact((document) => {
      applied = applyReplacementsToYText(document.getText(CODEMIRROR_TEXT), request.replacements);
    });
  } finally {
    await connection.disconnect();
  }
  return applied;
}
