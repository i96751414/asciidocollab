'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildIncludeGraph, type FileTreeEventDto } from '@asciidocollab/shared';
import {
  buildProjectSymbolIndex,
  makeIncludeResolver,
  type ProjectSymbolIndex,
} from '@/lib/codemirror/asciidoc-symbol-index';
import type { FileTreeNode } from '@/components/file-tree/types';
import { getDocumentContent } from '@/lib/api/file-content';
import { fetchProjectFileTree } from '@/lib/api/file-tree';
import { useFileTreeEvents } from '@/hooks/use-file-tree-events';

/** Cap on concurrent content fetches while assembling the include tree (FR-073/SC-025). */
const MAX_CONCURRENT_FETCHES = 6;
/** Hard bound on fixpoint passes; each pass fetches ≥1 new file, so this can never be hit in practice. */
const MAX_PASSES = 1000;

/** Options for {@link useProjectSymbolIndex}. */
interface UseProjectSymbolIndexOptions {
  /** The project whose files form the include tree. */
  projectId: string;
  /** Root of the include tree: the configured main file, or the open file when none (FR-045/047). Null ⇒ no index. */
  rootFileId: string | null;
  /** The currently-open file id, whose live (unsaved) content overlays the persisted copy (FR-048). */
  openFileId?: string | null;
  /** Live content of the open file; used instead of a fetch so in-progress edits are reflected. */
  liveContent?: string | null;
}

/** Result of {@link useProjectSymbolIndex}. */
interface UseProjectSymbolIndexResult {
  /** The current cross-file symbol index, or null when no root is configured. */
  index: ProjectSymbolIndex | null;
  /** Stable accessor returning the latest index (for CM extensions that capture a getter). */
  getIndex: () => ProjectSymbolIndex | null;
}

/** Flatten a file tree into bidirectional id↔path maps (files only; paths normalized to project-relative). */
function indexFilePaths(
  node: FileTreeNode,
  pathById: Map<string, string>,
  idByPath: Map<string, string>,
): void {
  if (node.type === 'file') {
    const path = node.path.replace(/^\/+/, '');
    pathById.set(node.id, path);
    idByPath.set(path, node.id);
  }
  for (const child of node.children) indexFilePaths(child, pathById, idByPath);
}

/**
 * Build and maintain the cross-file AsciiDoc symbol index for the editor (US8, FR-045a).
 *
 * Fetches each file reachable from the root through the cycle-guarded include walk
 * exactly once (deduped against a per-file cache, capped concurrency) so a single
 * open/refresh of an N-file tree issues at most N content reads (FR-073/SC-025).
 * Invalidates on file-tree SSE events and whenever the root (main-file) changes, and
 * overlays the open file's live content so the index reflects in-progress edits.
 *
 * @param options - {@link UseProjectSymbolIndexOptions}.
 * @returns The {@link UseProjectSymbolIndexResult}.
 */
export function useProjectSymbolIndex({
  projectId,
  rootFileId,
  openFileId,
  liveContent,
}: UseProjectSymbolIndexOptions): UseProjectSymbolIndexResult {
  const [index, setIndex] = useState<ProjectSymbolIndex | null>(null);
  const indexReference = useRef<ProjectSymbolIndex | null>(null);
  indexReference.current = index;

  const contentCache = useRef<Map<string, string | null>>(new Map());
  const pathById = useRef<Map<string, string>>(new Map());
  const idByPath = useRef<Map<string, string>>(new Map());
  const treeLoaded = useRef(false);
  const buildToken = useRef(0);

  // Hold the live overlay in a ref so a rebuild reads the latest text without re-subscribing.
  const liveOverlay = useRef<{ id: string | null; text: string | null }>({
    id: openFileId ?? null,
    text: liveContent ?? null,
  });
  liveOverlay.current = { id: openFileId ?? null, text: liveContent ?? null };

  const readContent = useCallback((fileId: string): string | null => {
    const overlay = liveOverlay.current;
    if (overlay.id !== null && fileId === overlay.id && overlay.text !== null) return overlay.text;
    return contentCache.current.get(fileId) ?? null;
  }, []);

  const build = useCallback(async () => {
    if (!rootFileId) {
      buildToken.current += 1;
      indexReference.current = null;
      setIndex(null);
      return;
    }
    buildToken.current += 1;
    const token = buildToken.current;

    if (!treeLoaded.current) {
      try {
        const tree = await fetchProjectFileTree(projectId);
        if (token !== buildToken.current) return;
        const nextPathById = new Map<string, string>();
        const nextIdByPath = new Map<string, string>();
        indexFilePaths(tree, nextPathById, nextIdByPath);
        pathById.current = nextPathById;
        idByPath.current = nextIdByPath;
        treeLoaded.current = true;
      } catch {
        /* Tree load failed — fall through; resolution degrades to whatever is already cached/live. */
      }
    }

    const resolveInclude = makeIncludeResolver(
      (id) => pathById.current.get(id) ?? null,
      (path) => idByPath.current.get(path) ?? null,
    );

    // Fixpoint: walk the include graph, fetching any reachable-but-uncached file. Each file is
    // fetched once (the cache stores null for 404s too), so the loop converges in ≤ depth passes.
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const tree = buildIncludeGraph(rootFileId, readContent, resolveInclude);
      const missing = tree.nodes.filter(
        (id) => id !== liveOverlay.current.id && !contentCache.current.has(id),
      );
      if (missing.length === 0) break;
      for (let start = 0; start < missing.length; start += MAX_CONCURRENT_FETCHES) {
        const batch = missing.slice(start, start + MAX_CONCURRENT_FETCHES);
        const fetched = await Promise.all(
          batch.map((id) =>
            getDocumentContent(projectId, id).then(
              (text) => ({ id, text }),
              () => ({ id, text: null }),
            ),
          ),
        );
        if (token !== buildToken.current) return;
        for (const entry of fetched) contentCache.current.set(entry.id, entry.text);
      }
    }
    if (token !== buildToken.current) return;

    const built = buildProjectSymbolIndex(
      rootFileId,
      readContent,
      resolveInclude,
      liveOverlay.current.id ?? rootFileId,
      (id) => pathById.current.get(id) ?? null,
    );
    indexReference.current = built;
    setIndex(built);
  }, [projectId, rootFileId, readContent]);

  // Rebuild when the project or root (main-file) changes.
  useEffect(() => {
    build();
  }, [build]);

  // Rebuild (sync extraction, no fetch) shortly after the open file's live content settles.
  useEffect(() => {
    const handle = setTimeout(() => {
      build();
    }, 250);
    return () => clearTimeout(handle);
  }, [liveContent, openFileId, build]);

  // Invalidate on file-tree SSE: structural change ⇒ path maps + the affected file's cache are stale.
  const handleEvent = useCallback(
    (event: FileTreeEventDto) => {
      treeLoaded.current = false;
      contentCache.current.delete(event.fileNodeId);
      build();
    },
    [build],
  );
  const handleReconnect = useCallback(() => {
    treeLoaded.current = false;
    contentCache.current.clear();
    build();
  }, [build]);
  useFileTreeEvents(projectId, handleEvent, handleReconnect);

  const getIndex = useCallback(() => indexReference.current, []);
  return { index, getIndex };
}
