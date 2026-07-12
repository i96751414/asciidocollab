'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SnapshotFile } from '@/lib/pdf/build-project-snapshot';
import { fetchProjectAsset } from '@/lib/pdf/fetch-project-asset';

/**
 * A per-project cache of fetched binary asset bytes for the PDF pipeline, plus the two ways the layout
 * feeds them into a render snapshot:
 *  - the LIVE PREVIEW schedules fetches with {@link ProjectAssetCache.ensureAssets} (fire-and-forget)
 *    and reads whatever is cached so far with {@link ProjectAssetCache.getAssets}; each newly-arrived
 *    asset bumps {@link ProjectAssetCache.assetVersion} so the caller rebuilds the snapshot and the
 *    image appears on the next render — the editor thread is never blocked;
 *  - the ONE-CLICK EXPORT awaits {@link ProjectAssetCache.loadAssets} so every referenced asset is
 *    fetched before the (final, downloaded) PDF is rendered.
 *
 * Fetches are deduplicated by path: an in-flight or already-cached asset is never re-fetched, so a
 * given image is fetched once per project regardless of how many renders reference it.
 */
export interface ProjectAssetCache {
  /**
   * The binary asset records fetched so far, as snapshot files. A fresh array each call; the underlying
   * bytes are shared. Read synchronously while building a render snapshot.
   *
   * @returns The cached binary snapshot files.
   */
  getAssets: () => SnapshotFile[];
  /**
   * Schedule background fetches for any of `paths` not already cached or in flight. Fire-and-forget:
   * each asset that arrives bumps {@link assetVersion}. Safe to call on every render — it dedupes.
   *
   * @param paths - Project-relative asset paths the current render references.
   */
  ensureAssets: (paths: readonly string[]) => void;
  /**
   * Fetch every path in `paths` (reusing the cache and any in-flight request) and resolve with the
   * snapshot files for those that were fetched successfully; unavailable assets are simply omitted.
   *
   * @param paths - Project-relative asset paths to fetch before rendering.
   * @returns The successfully fetched binary snapshot files.
   */
  loadAssets: (paths: readonly string[]) => Promise<SnapshotFile[]>;
  /** Increments whenever newly fetched bytes land, so a snapshot memo can rebuild to include them. */
  assetVersion: number;
}

/** Wrap cached bytes as a binary snapshot file keyed by its project-relative path. */
function toBinaryFile(path: string, bytes: Uint8Array): SnapshotFile {
  return { path, kind: 'binary', bytes };
}

/**
 * Maintain the fetched-asset cache for a project's PDF renders.
 *
 * @param projectId - The project whose assets are cached; the cache resets when it changes.
 * @returns The {@link ProjectAssetCache} accessors.
 */
export function useProjectAssetCache(projectId: string): ProjectAssetCache {
  // Bytes cached by project-relative path, and the promises for fetches currently in flight (so
  // concurrent renders referencing the same image share one request). Held in refs so reading them
  // while building a snapshot never depends on a re-render.
  const cache = useRef<Map<string, Uint8Array>>(new Map());
  const inFlight = useRef<Map<string, Promise<Uint8Array | null>>>(new Map());
  const [assetVersion, setAssetVersion] = useState(0);

  // A project switch invalidates every cached asset (paths are project-relative). Clearing the
  // in-flight map lets any late-arriving fetch from the previous project still populate its own
  // (now-unread) cache without affecting the new one.
  useEffect(() => {
    cache.current = new Map();
    inFlight.current = new Map();
    setAssetVersion((version) => version + 1);
  }, [projectId]);

  // Fetch one asset, deduped: a cached hit resolves immediately, an in-flight request is shared, and a
  // fresh fetch caches its bytes and bumps the version so snapshot consumers rebuild to include it.
  const fetchOne = useCallback(
    (path: string): Promise<Uint8Array | null> => {
      // Capture THIS project's maps: a project switch replaces `cache.current`/`inFlight.current` with
      // fresh maps, and a fetch started here must land its late-arriving bytes in the map it belongs to
      // (now discarded) — never in the new project's cache — so switching projects can't cross-pollute.
      const fetchCache = cache.current;
      const fetchInFlight = inFlight.current;
      const cached = fetchCache.get(path);
      if (cached !== undefined) return Promise.resolve(cached);
      const pending = fetchInFlight.get(path);
      if (pending !== undefined) return pending;
      const promise = fetchProjectAsset(projectId, path).then((bytes) => {
        fetchInFlight.delete(path);
        if (bytes !== null) {
          fetchCache.set(path, bytes);
          // Only signal a rebuild when this fetch's cache is still the active one; a late resolve after a
          // project switch populates the old (unread) cache without disturbing the current project.
          if (cache.current === fetchCache) setAssetVersion((version) => version + 1);
        }
        return bytes;
      });
      fetchInFlight.set(path, promise);
      return promise;
    },
    [projectId],
  );

  const getAssets = useCallback(
    (): SnapshotFile[] => [...cache.current.entries()].map(([path, bytes]) => toBinaryFile(path, bytes)),
    [],
  );

  const ensureAssets = useCallback(
    (paths: readonly string[]): void => {
      for (const path of paths) void fetchOne(path);
    },
    [fetchOne],
  );

  const loadAssets = useCallback(
    async (paths: readonly string[]): Promise<SnapshotFile[]> => {
      await Promise.all(paths.map((path) => fetchOne(path)));
      const records: SnapshotFile[] = [];
      for (const path of paths) {
        const bytes = cache.current.get(path);
        if (bytes !== undefined) records.push(toBinaryFile(path, bytes));
      }
      return records;
    },
    [fetchOne],
  );

  return { getAssets, ensureAssets, loadAssets, assetVersion };
}
