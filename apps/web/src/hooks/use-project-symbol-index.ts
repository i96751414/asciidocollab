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
import { getCollabDocumentInfo } from '@/lib/api/collab';
import { fetchProjectFileTree } from '@/lib/api/file-tree';
import { useFileTreeEvents } from '@/hooks/use-file-tree-events';
import { COLLAB_URL, COLLAB_YTEXT_KEY, collabRoomName } from '@/lib/editor-config';

/** Shared, stable empty scope returned before the index has built (avoids a new identity per call). */
const EMPTY_RESOLVED_SCOPE: ReadonlyMap<string, string> = new Map();

/**
 * Factory for a lightweight document observer. When the remote Yjs document updates,
 * `onUpdate` fires so the caller can invalidate its cache and recompute. The returned
 * object's `destroy()` closes the connection.
 *
 * Injected for tests; defaults to a real Hocuspocus/Y.Doc subscription at runtime.
 */
export type CreateDocumentObserver = (options: {
  url: string;
  name: string;
  fileId: string;
  /**
   * Fires on every change to the observed document, refreshing the caller's cache from the Yjs
   * replica's live text so a collaborator's UNSAVED edits are reflected — the persisted content
   * endpoint only reflects the last save, which would lag a live edit.
   *
   * @param content - The file's current live text read from the synced Y.Doc, or undefined when none.
   */
  onUpdate: (content?: string) => void;
}) => Promise<{ destroy(): void }>;

/**
 * Default runtime observer: connects a HocusPocus provider + Y.Doc and, on every update, reports the
 * live text from the shared `codemirror` Y.Text — the same type the editor binds — so the outline
 * tracks a collaborator's in-progress edits to an included file without waiting for a save.
 */
const defaultCreateDocumentObserver: CreateDocumentObserver = async ({ url, name, onUpdate }) => {
  // Dynamic import defers loading to call time so these browser-only modules are never loaded at
  // module initialisation in Node/test environments (test code always injects a fake factory).
  const Y = await import('yjs');
  const { HocuspocusProvider } = await import('@hocuspocus/provider');
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText(COLLAB_YTEXT_KEY);
  ydoc.on('update', () => onUpdate(ytext.toString()));
  const provider = new HocuspocusProvider({ url, name, document: ydoc });
  return {
    destroy() {
      provider.destroy();
      ydoc.destroy();
    },
  };
};

/** Options for {@link useProjectSymbolIndex}. */
interface UseProjectSymbolIndexOptions {
  /** The project whose files form the include tree. */
  projectId: string;
  /** Root of the include tree: the configured main file, or the open file when none. Null ⇒ no index. */
  rootFileId: string | null;
  /** The currently-open file id, whose live (unsaved) content overlays the persisted copy. */
  openFileId?: string | null;
  /** Live content of the open file; used instead of a fetch so in-progress edits are reflected. */
  liveContent?: string | null;
  /**
   * Overrides the document observer factory in tests. When provided, observers are created for each
   * reachable non-open file to detect live collaborative changes (feature 032).
   */
  createDocumentObserver?: CreateDocumentObserver;
  /**
   * Whether to hold live collaborative observer connections for reachable non-open files.
   * Each observer is a real Hocuspocus connection to that file's room, so this should be enabled ONLY
   * while the full-document outline is actually being viewed — otherwise every open file with includes
   * would keep N idle collaborative sessions alive (extra load + teardown races). Defaults to true to
   * preserve the standalone-hook behaviour; the editor passes the outline-visibility-derived value.
   */
  observeReachableDocuments?: boolean;
  /**
   * Resolves a file node id to the id of its collaborative room (the document's `yjsStateId`, which
   * is distinct from the file node id). The observer must join the room keyed by `yjsStateId` — the
   * same room the editor binds — to receive a collaborator's live edits. Defaults
   * to a lookup via the collab-info endpoint; injected in tests to stay hermetic.
   *
   * @param fileId - The file node id whose collaborative room id is wanted.
   * @returns The room id (`yjsStateId`), or null when the file has no collaborative document.
   */
  resolveCollabRoomId?: (fileId: string) => Promise<string | null>;
}

/** Result of {@link useProjectSymbolIndex}. */
interface UseProjectSymbolIndexResult {
  /** The current cross-file symbol index, or null when no root is configured. */
  index: ProjectSymbolIndex | null;
  /** Stable accessor returning the latest index (for CM extensions that capture a getter). */
  getIndex: () => ProjectSymbolIndex | null;
  /**
   * Snapshot of cached file contents keyed by project-relative path, with the open file's live
   * (unsaved) content overlaid — the input the preview's include assembler needs.
   *
   * @returns A path→content map covering the files fetched so far.
   */
  getFiles: () => Record<string, string>;
  /**
   * The resolved cross-document attribute scope for a file: the attributes it inherits from the
   * documents that include it (its ancestors along the include path from the root) merged with its
   * own definitions, with the file's own winning. This is the scope the editor uses to decide which
   * `{name}` references resolve cross-document and should highlight as known. Empty
   * before the index has built or when the file is unreachable from the root.
   *
   * @param fileId - Identifier of the file whose resolved scope is wanted.
   * @returns The resolved attribute map (lowercase name → value); empty when none.
   */
  resolvedScopeOf: (fileId: string) => ReadonlyMap<string, string>;
  /**
   * Force a full rebuild from the server, discarding the cached file contents and
   * tree. This is needed after an operation that rewrites persisted content
   * without a file-tree event, such as a project-wide symbol rename.
   */
  refresh: () => void;
  /**
   * Looks up the file node id for a project-relative path (reverse of pathOf).
   *
   * @param path - Project-relative path.
   * @returns The file node id, or null when the path is not in the tree.
   */
  fileIdForPath: (path: string) => string | null;
  /**
   * Counter that increments whenever a reachable non-open file's live content changes (feature 032).
   * Consumers can include this in useMemo/useEffect dependency arrays to recompute the
   * assembled full-document outline when a collaborator edits an included file.
   */
  reachableDocVersion: number;
}

/**
 * Build and maintain the cross-file AsciiDoc symbol index for the editor.
 *
 * Fetches each file reachable from the root through the cycle-guarded include walk
 * exactly once (deduped against a per-file cache, capped concurrency) so a single
 * open/refresh of an N-file tree issues at most N content reads.
 * Invalidates on file-tree SSE events and whenever the root (main-file) changes, and
 * overlays the open file's live content so the index reflects in-progress edits.
 *
 * When `createDocumentObserver` is provided (or at runtime), also observes live Yjs
 * changes for each reachable non-open included file and exposes `reachableDocVersion`
 * so downstream outline assembly can recompute on collaborator edits.
 *
 * @param options - {@link UseProjectSymbolIndexOptions}.
 * @returns The {@link UseProjectSymbolIndexResult}.
 */
export function useProjectSymbolIndex({
  projectId,
  rootFileId,
  openFileId,
  liveContent,
  createDocumentObserver,
  resolveCollabRoomId,
  observeReachableDocuments = true,
}: UseProjectSymbolIndexOptions): UseProjectSymbolIndexResult {
  const [index, setIndex] = useState<ProjectSymbolIndex | null>(null);
  const indexReference = useRef<ProjectSymbolIndex | null>(null);
  indexReference.current = index;

  const [reachableDocumentVersion, setReachableDocumentVersion] = useState(0);

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
  {
    const next = { id: openFileId ?? null, text: liveContent ?? null };
    const previous = liveOverlay.current;
    // When the open file changes, commit the file we're LEAVING into the cache from its last overlay
    // text before the overlay is reassigned to the new file. The open file is served from the overlay
    // (and excluded from fetching), so without this it would vanish from `getFiles()` the instant the
    // selection moves — collapsing the assembled full-document outline to the current-file fallback
    // for a frame until the next rebuild re-fetches it. Done during render so the assembled memo in
    // the same render already sees the committed content.
    if (previous.id !== null && previous.id !== next.id && previous.text !== null) {
      contentCache.current.set(previous.id, previous.text);
    }
    liveOverlay.current = next;
  }

  // Live observers for reachable non-open files (feature 032).
  const documentObservers = useRef<Map<string, { destroy(): void }>>(new Map());
  const createDocumentObserverReference = useRef(createDocumentObserver);
  createDocumentObserverReference.current = createDocumentObserver;
  // Resolves a file node id → its collaborative room id (the document's `yjsStateId`); defaults to a
  // collab-info lookup. Held in a ref so the build closure reads the latest without re-subscribing.
  const resolveCollabRoomIdReference = useRef(resolveCollabRoomId);
  resolveCollabRoomIdReference.current = resolveCollabRoomId;
  // Whether observers should currently be held (outline visible in full scope). Read via a ref so the
  // build closure sees the latest value without being recreated.
  const observeReachableDocumentsReference = useRef(observeReachableDocuments);
  observeReachableDocumentsReference.current = observeReachableDocuments;

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
      // The open file is served by its editor (overlay/Yjs sync), never fetched — fetching it would
      // add a redundant content round-trip per file open. When the overlay text is briefly null (just
      // before the editor produces content), a file the open file was switched FROM is already in the
      // cache (it was a reachable non-open file, or was committed on switch), so the assembled outline
      // still reads it; only a brand-new open file's headings wait for its editor to sync.
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

    // RECONCILE the live document observers for reachable non-open files (feature 032).
    //
    // We create/destroy only the DELTA and never recreate an existing observer. A fresh observer's
    // initial Yjs sync fires an `update`, so a destroy-and-recreate-all approach would re-enter the
    // `onUpdate` handler below in an endless loop. Touching only the delta leaves existing observers
    // quiet, so this is safe to run on EVERY build — including the soft rebuild that an `onUpdate`
    // itself triggers — and it correctly picks up a file that just became reachable (e.g. a
    // collaborator live-adds an `include::`) as well as tearing observers down when the full-document
    // outline is hidden (`observeReachableDocuments` false → empty wanted set).
    const factory = createDocumentObserverReference.current ?? (
      // Only use the real Hocuspocus observer at runtime (not during tests).
      globalThis.window === undefined ? undefined : defaultCreateDocumentObserver
    );
    const openId = liveOverlay.current.id;
    const wanted = factory && observeReachableDocumentsReference.current
      ? new Set([...built.tree.nodes].filter((id) => id !== openId)) // reachable, non-open
      : new Set<string>();
    // Tear down observers for files no longer wanted (dropped from the reachable set, now the open
    // file, or observers turned off entirely).
    for (const [fileId, obs] of documentObservers.current) {
      if (!wanted.has(fileId)) {
        obs.destroy();
        documentObservers.current.delete(fileId);
      }
    }
    if (factory && wanted.size > 0) {
      // Resolve a file node id → its collaborative room id (the document's `yjsStateId`). The default
      // queries the collab-info endpoint and tolerates failure (asset with no document, or offline).
      const resolveRoomId = resolveCollabRoomIdReference.current
        ?? ((id: string) => getCollabDocumentInfo(projectId, id).then((info) => info?.yjsStateId ?? null).catch(() => null));
      for (const fileId of wanted) {
        if (documentObservers.current.has(fileId)) continue; // already observed — leave it quiet
        const roomId = await resolveRoomId(fileId);
        if (isCancelled()) return;
        if (!roomId) continue; // no collaborative document for this file — nothing to observe
        const obs = await factory({
          url: COLLAB_URL,
          name: collabRoomName(projectId, roomId),
          fileId,
          onUpdate: (liveText?: string) => {
            // Refresh this file's cached content from the Yjs replica's LIVE text (a collaborator's
            // unsaved edit); when no live text is available, drop the cache so the rebuild re-fetches
            // the persisted copy. Then rebuild — observer reconciliation makes this re-entrant-safe
            // (existing observers are left untouched) — and bump the version after it settles so the
            // assembled outline recomputes.
            if (typeof liveText === 'string') contentCache.current.set(fileId, liveText);
            else contentCache.current.delete(fileId);
            void build().then(() => {
              setReachableDocumentVersion((v) => v + 1);
            });
          },
        });
        if (isCancelled()) { obs.destroy(); return; }
        documentObservers.current.set(fileId, obs);
      }
    }
  }, [projectId, rootFileId, readContent]);

  // Rebuild when the project or root (main-file) changes.
  useEffect(() => {
    build();
  }, [build]);

  // When observer-holding is toggled (the full-document outline becomes visible / hidden), rebuild so
  // observers are established or torn down. Skips the initial mount — the effect above already builds.
  const previousObserveReachableDocuments = useRef(observeReachableDocuments);
  useEffect(() => {
    if (previousObserveReachableDocuments.current === observeReachableDocuments) return;
    previousObserveReachableDocuments.current = observeReachableDocuments;
    build();
  }, [observeReachableDocuments, build]);

  // Rebuild (sync extraction, no fetch) shortly after the open file's live content settles.
  useEffect(() => {
    const handle = setTimeout(() => {
      build();
    }, 250);
    return () => clearTimeout(handle);
  }, [liveContent, openFileId, build]);

  // (The file we switch away from is preserved in the cache from its last overlay text during render —
  // see the `liveOverlay` commit above — so the assembled outline never momentarily loses it. Its live
  // edits keep flowing in afterwards: once it is a reachable non-open file its observer refreshes the
  // cache, exactly like any other included file.)

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

  // Destroy all document observers on unmount.
  useEffect(() => {
    return () => {
      for (const [, obs] of documentObservers.current) obs.destroy();
      documentObservers.current.clear();
    };
  }, []);

  const getIndex = useCallback(() => indexReference.current, []);
  // The resolved cross-document scope (inherited from ancestors + the file's own definitions, the
  // file's own winning) drives the editor's known-vs-unknown `{name}` highlighting.
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
  const fileIdForPath = useCallback(
    (path: string): string | null => idByPath.current.get(path) ?? null,
    [],
  );
  return { index, getIndex, getFiles, resolvedScopeOf, refresh, fileIdForPath, reachableDocVersion: reachableDocumentVersion };
}
