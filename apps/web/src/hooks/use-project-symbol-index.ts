'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileTreeEventDto } from '@asciidocollab/shared';
import {
  buildProjectSymbolIndex,
  makeIncludeResolver,
  type ProjectSymbolIndex,
} from '@/lib/codemirror/asciidoc-symbol-index';
import { buildFilePathIndex } from '@/lib/codemirror/file-path-index';
import { fetchReachableContent } from '@/lib/codemirror/include-tree-fetcher';
import { getDocumentContent } from '@/lib/api/file-content';
import { fetchProjectFileTree } from '@/lib/api/file-tree';
import { useFileTreeEvents } from '@/hooks/use-file-tree-events';

/** Shared, stable empty scope returned before the index has built (avoids a new identity per call). */
const EMPTY_RESOLVED_SCOPE: ReadonlyMap<string, string> = new Map();

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
  /**
   * Snapshot of cached file contents keyed by project-relative path, with the open file's live
   * (unsaved) content overlaid — the input the preview's include assembler needs (FR-068).
   *
   * @returns A path→content map covering the files fetched so far.
   */
  getFiles: () => Record<string, string>;
  /**
   * The resolved cross-document attribute scope for a file: the attributes it inherits from the
   * documents that include it (its ancestors along the include path from the root) merged with its
   * own definitions, with the file's own winning. This is the scope the editor uses to decide which
   * `{name}` references resolve cross-document and should highlight as known (US6/FR-020). Empty
   * before the index has built or when the file is unreachable from the root.
   *
   * @param fileId - Identifier of the file whose resolved scope is wanted.
   * @returns The resolved attribute map (lowercase name → value); empty when none.
   */
  resolvedScopeOf: (fileId: string) => ReadonlyMap<string, string>;
  /**
   * Force a full rebuild from the server, discarding the cached file contents and
   * tree. This is needed after an operation that rewrites persisted content
   * without a file-tree event, such as a project-wide symbol rename (FR-064).
   */
  refresh: () => void;
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
  // Memoises resolved scopes per (index identity, fileId): `effectiveAttributes` builds a fresh Map on
  // every call, so without this cache `resolvedScopeOf(fileId)` would return a new identity each render
  // and the editor's `[resolvedScope]` effect would re-dispatch CodeMirror effects + re-publish the
  // outline on every parent re-render (keystroke/cursor move). Invalidated whenever the index rebuilds.
  const scopeCache = useRef<{ index: ProjectSymbolIndex | null; byFile: Map<string, ReadonlyMap<string, string>> }>({
    index: null,
    byFile: new Map(),
  });

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
    const isCancelled = (): boolean => token !== buildToken.current;

    if (!treeLoaded.current) {
      try {
        const tree = await fetchProjectFileTree(projectId);
        if (isCancelled()) return;
        const paths = buildFilePathIndex(tree);
        pathById.current = paths.pathById;
        idByPath.current = paths.idByPath;
        treeLoaded.current = true;
      } catch {
        /* Tree load failed — fall through; resolution degrades to whatever is already cached/live. */
      }
    }

    const resolveInclude = makeIncludeResolver(
      (id) => pathById.current.get(id) ?? null,
      (path) => idByPath.current.get(path) ?? null,
    );

    const completed = await fetchReachableContent({
      rootFileId,
      readContent,
      resolveInclude,
      fetchContent: (id) => getDocumentContent(projectId, id),
      cache: contentCache.current,
      overlayFileId: liveOverlay.current.id,
      isCancelled,
    });
    if (!completed) return;

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

  // When the open file changes, drop the file we just switched AWAY from out of the content cache.
  // That file may have unsaved edits that were only ever held in its live overlay (now gone), so its
  // cached copy is stale; the next rebuild re-fetches its CURRENT text from the content endpoint —
  // which serves the live collaborative (Hocuspocus/Yjs) state for a file with an open session — so
  // a child's cross-document resolution reflects a parent's just-typed, unsaved edits (FR-007a).
  const previousOpenFileId = useRef<string | null>(openFileId ?? null);
  useEffect(() => {
    const previous = previousOpenFileId.current;
    const current = openFileId ?? null;
    if (previous !== null && previous !== current) contentCache.current.delete(previous);
    previousOpenFileId.current = current;
  }, [openFileId]);

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

  // Discard all cached content + the tree and rebuild from the server (used after a symbol rename
  // rewrites persisted files without emitting a file-tree event). Mirrors the reconnect path.
  const refresh = useCallback(() => {
    treeLoaded.current = false;
    contentCache.current.clear();
    build();
  }, [build]);

  const getIndex = useCallback(() => indexReference.current, []);
  // The resolved cross-document scope (inherited from ancestors + the file's own definitions, the
  // file's own winning) drives the editor's known-vs-unknown `{name}` highlighting (US6/FR-020).
  // `effectiveAttributes` already composes inheritance with the file's own entries — the same
  // result `resolveAttributeScope` produces against the project main file as root. The result is
  // cached per (index, fileId) so the returned Map keeps a STABLE identity across renders until the
  // index rebuilds — otherwise the editor re-runs its `[resolvedScope]` effect on every render.
  const resolvedScopeOf = useCallback((fileId: string): ReadonlyMap<string, string> => {
    const current = indexReference.current;
    if (current === null) return EMPTY_RESOLVED_SCOPE;
    const cache = scopeCache.current;
    if (cache.index !== current) {
      cache.index = current;
      cache.byFile = new Map();
    }
    let scope = cache.byFile.get(fileId);
    if (scope === undefined) {
      scope = current.effectiveAttributes(fileId);
      cache.byFile.set(fileId, scope);
    }
    return scope;
  }, []);
  const getFiles = useCallback((): Record<string, string> => {
    const files: Record<string, string> = {};
    for (const [id, path] of pathById.current) {
      const content = readContent(id);
      if (content !== null) files[path] = content;
    }
    return files;
  }, [readContent]);
  return { index, getIndex, getFiles, resolvedScopeOf, refresh };
}
