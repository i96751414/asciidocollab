import { buildIncludeGraph } from '@asciidocollab/asciidoc-core';
import { RENDER_INTRINSIC_ATTRIBUTES } from '../asciidoc/render-intrinsics';

/** Cap on concurrent content fetches while assembling the include tree. */
export const MAX_CONCURRENT_FETCHES = 6;
/** Hard bound on fixpoint passes; each pass fetches ≥1 new file, so this can never be hit in practice. */
const MAX_PASSES = 1000;

/** Inputs to {@link fetchReachableContent}. */
export interface FetchReachableContentOptions {
  /** Root of the include tree to walk. */
  rootFileId: string;
  /**
   * Returns a file's already-known (cached or live-overlay) content, or null.
   *
   * @param fileId - The file whose known content is wanted.
   */
  readContent: (fileId: string) => string | null;
  /**
   * Resolves an include target (relative to a file) to a file id, or null.
   *
   * @param fromFileId - The file the include directive lives in.
   * @param target - The include target path.
   */
  resolveInclude: (fromFileId: string, target: string) => string | null;
  /**
   * Fetches a file's persisted content from the server.
   *
   * @param fileId - The file to fetch.
   */
  fetchContent: (fileId: string) => Promise<string>;
  /** Mutable content cache; populated in place (null is stored for failed/absent fetches). */
  cache: Map<string, string | null>;
  /** Id of the file served from the live overlay, which must never be fetched. */
  overlayFileId: string | null;
  /** Returns true once this build has been superseded; the walk then aborts early. */
  isCancelled: () => boolean;
}

/**
 * Fetch into `cache` every file reachable from the root through the cycle-guarded
 * include walk, exactly once and with capped concurrency.
 *
 * Runs a fixpoint: each pass rebuilds the include graph from currently-known
 * content and fetches any reachable-but-uncached file. The cache stores null for
 * failed/absent fetches too, so a file is read at most once and the loop converges
 * in ≤ include-depth passes. The live-overlay file is never fetched.
 *
 * @param options - {@link FetchReachableContentOptions}.
 * @returns Resolves true when the walk completed, false when it was cancelled mid-flight.
 */
export async function fetchReachableContent({
  rootFileId,
  readContent,
  resolveInclude,
  fetchContent,
  cache,
  overlayFileId,
  isCancelled,
}: FetchReachableContentOptions): Promise<boolean> {
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    // Seed the render intrinsics so conditional includes are gated exactly as the symbol index,
    // effective-offset walk, and preview assembler gate them (e.g. an `ifdef::backend-html5[]` include
    // is reachable) — otherwise an intrinsic-gated file is never fetched yet wanted by every consumer.
    const tree = buildIncludeGraph(rootFileId, readContent, resolveInclude, RENDER_INTRINSIC_ATTRIBUTES);
    const missing = tree.nodes.filter((id) => id !== overlayFileId && !cache.has(id));
    if (missing.length === 0) break;
    for (let start = 0; start < missing.length; start += MAX_CONCURRENT_FETCHES) {
      const batch = missing.slice(start, start + MAX_CONCURRENT_FETCHES);
      const fetched = await Promise.all(
        batch.map((id) =>
          fetchContent(id).then(
            (text) => ({ id, text }),
            () => ({ id, text: null }),
          ),
        ),
      );
      if (isCancelled()) return false;
      for (const entry of fetched) cache.set(entry.id, entry.text);
    }
  }
  return !isCancelled();
}
