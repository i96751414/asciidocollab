'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ScrollRequest } from '@/hooks/use-asciidoc-preview';
import type { ProjectSymbolIndex } from '@/lib/codemirror/asciidoc-symbol-index';
import type { XrefTarget } from '@/lib/codemirror/asciidoc-link-handler';
import type { SymbolUsage } from '@/lib/api/projects';
import type { CursorSymbol } from '@/lib/codemirror/asciidoc-symbol-at-cursor';
import type { ProjectSymbol } from '@asciidocollab/shared';

interface EditorNavigationOptions {
  /** Live cross-file symbol index value (re-renders when it changes). */
  projectIndex: ProjectSymbolIndex | null;
  /** Stable accessor for the latest cross-file symbol index. */
  getProjectIndex: () => ProjectSymbolIndex | null;
  /** Rebuilds the cross-file symbol index after a rename rewrites persisted files. */
  refreshProjectIndex: () => void;
}

interface EditorNavigation {
  /** Live scroll-sync request fed to the preview; null until a scroll/line event fires. */
  scrollRequest: ScrollRequest | null;
  /** Resets the scroll-sync state (used when the open file changes). */
  resetScroll: () => void;
  /** Live same-file go-to-definition reveal request; each nonce reveals once. */
  revealRequest: { line: number; nonce: number } | null;
  /** Live request asking the file tree to reveal + select a path; each nonce re-fires. */
  openPathRequest: { path: string; nonce: number } | null;
  // Pending cross-file go-to-definition line: set when an xref targets another file, consumed by
  // the next selection so the opened file reveals the definition via its mount-time initialLine.
  pendingXrefLine: RefObject<number | null>;
  // Scroll-sync handler: dedups identical consecutive lines to avoid jitter.
  handleScrollLine: (line: number) => void;
  // Line-click handler: always fires, even for the same line clicked twice.
  handleLineClick: (line: number) => void;
  // Ctrl+click on a macro path: asks the file tree to reveal + select that file.
  handleNavigateToFile: (path: string) => void;
  // Cross-reference go-to-definition (FR-049): same-file reveal or cross-file switch.
  handleNavigateToXref: (target: XrefTarget) => void;
  // Ctrl+click on a link or URL: opens it in a new tab.
  handleOpenUrl: (url: string) => void;
  /** Go to Symbol palette open state (FR-061). */
  goToSymbolOpen: boolean;
  setGoToSymbolOpen: (open: boolean) => void;
  // Resolves a symbol file id to its path via the live index.
  symbolPathOf: (id: string) => string | null;
  // Selecting a symbol reuses the xref go-to-definition path.
  handleSelectSymbol: (symbol: ProjectSymbol) => void;
  /** Cross-file refactoring dialog open state (US12/FR-064-065). */
  refactorOpen: boolean;
  setRefactorOpen: (open: boolean) => void;
  /** Symbol the refactor dialog opens seeded with (the cursor symbol), or null for a cold open. */
  refactorInitial: CursorSymbol | null;
  // Opens the refactor dialog, seeded with the given cursor symbol (null clears any prior seed).
  openRefactor: (initial?: CursorSymbol | null) => void;
  // Navigates to a usage surfaced by the refactor dialog.
  handleNavigateToUsage: (usage: SymbolUsage) => void;
  /** After a rename rewrites persisted files, rebuild the index. */
  handleSymbolRenamed: () => void;
}

/**
 * File + cross-reference navigation, the go-to-symbol palette, and the refactor dialog. Owns the
 * reveal/open-path/scroll requests and the keyboard shortcuts that drive them. The pending xref
 * line ref is exposed so the restoration hook's selection handler can consume it.
 */
export function useEditorNavigation({
  projectIndex,
  getProjectIndex,
  refreshProjectIndex,
}: EditorNavigationOptions): EditorNavigation {
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null);
  // Live editor reveal request (same-file go-to-definition, FR-049); each nonce reveals once.
  const [revealRequest, setRevealRequest] = useState<{ line: number; nonce: number } | null>(null);
  const revealNonce = useRef(0);
  // Track the last line scrolled via scroll-sync to deduplicate rapid fire events.
  const lastScrolledLine = useRef<number | null>(null);
  const pendingXrefLine = useRef<number | null>(null);

  const resetScroll = useCallback(() => {
    setScrollRequest(null);
    lastScrolledLine.current = null;
  }, []);

  // Scroll-sync handler: dedup identical consecutive lines to avoid jitter.
  const handleScrollLine = useCallback((line: number) => {
    if (lastScrolledLine.current === line) return;
    lastScrolledLine.current = line;
    setScrollRequest({ line });
  }, []);

  // Line-click handler: always fires, even for the same line clicked twice.
  // No dedup — the user intentionally clicked, so we always issue a fresh scroll.
  const handleLineClick = useCallback((line: number) => {
    setScrollRequest({ line });
  }, []);

  // Ctrl+click on a macro path asks the file tree to reveal + select that file. A bumped nonce
  // makes each request distinct so repeat clicks on the same path re-fire.
  const [openPathRequest, setOpenPathRequest] = useState<{ path: string; nonce: number } | null>(null);
  const openPathNonce = useRef(0);
  const handleNavigateToFile = useCallback((path: string) => {
    openPathNonce.current += 1;
    setOpenPathRequest({ path, nonce: openPathNonce.current });
  }, []);
  // Cross-reference go-to-definition (FR-049): reveal in place when the target is the open file,
  // otherwise switch to the defining file (carrying the line to reveal once it mounts).
  const handleNavigateToXref = useCallback((target: XrefTarget) => {
    if (target.sameFile || target.path === null) {
      revealNonce.current += 1;
      setRevealRequest({ line: target.line, nonce: revealNonce.current });
      return;
    }
    pendingXrefLine.current = target.line;
    handleNavigateToFile(target.path);
  }, [handleNavigateToFile]);

  // Go to Symbol palette (FR-061): jump to any section/anchor across the project tree. Selecting a
  // symbol reuses the xref go-to-definition path (same-file reveal or cross-file switch).
  const [goToSymbolOpen, setGoToSymbolOpen] = useState(false);
  const symbolPathOf = useCallback((id: string) => projectIndex?.pathOf(id) ?? null, [projectIndex]);
  const handleSelectSymbol = useCallback((symbol: ProjectSymbol) => {
    setGoToSymbolOpen(false);
    const index = getProjectIndex();
    if (!index) return;
    handleNavigateToXref({
      fileId: symbol.fileId,
      path: index.pathOf(symbol.fileId),
      line: index.lineOf(symbol.fileId, symbol.range.from),
      sameFile: symbol.fileId === index.activeFileId,
    });
  }, [getProjectIndex, handleNavigateToXref]);
  // Ctrl/Cmd+Shift+O opens the palette (VS Code-style "go to symbol").
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'o' || event.key === 'O')) {
        event.preventDefault();
        setGoToSymbolOpen(true);
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, []);

  // Cross-file refactoring dialog (US12/FR-064-065): find-usages + rename id/anchor/attribute.
  const [refactorOpen, setRefactorOpen] = useState(false);
  // Symbol seeding the dialog when opened from the toolbar with the cursor on a symbol; null seeds
  // a blank dialog (keyboard shortcut, or cursor not on a symbol).
  const [refactorInitial, setRefactorInitial] = useState<CursorSymbol | null>(null);
  const openRefactor = useCallback((initial: CursorSymbol | null = null) => {
    setRefactorInitial(initial);
    setRefactorOpen(true);
  }, []);
  const handleNavigateToUsage = useCallback((usage: SymbolUsage) => {
    setRefactorOpen(false);
    const index = getProjectIndex();
    if (!index) return;
    handleNavigateToXref({
      fileId: usage.fileNodeId,
      path: usage.path,
      line: index.lineOf(usage.fileNodeId, usage.range.from),
      sameFile: usage.fileNodeId === index.activeFileId,
    });
  }, [getProjectIndex, handleNavigateToXref]);
  // After a rename rewrites persisted files, rebuild the index so usages/diagnostics reflect the new
  // name. The open file's live buffer is collab-owned and updates on its own (matching the move/rename
  // reference-rewrite precedent); the index overlays that live content so it stays consistent.
  const handleSymbolRenamed = useCallback(() => {
    refreshProjectIndex();
  }, [refreshProjectIndex]);
  // Ctrl/Cmd+Shift+R opens the refactoring dialog cold (no cursor-symbol seed).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'r' || event.key === 'R')) {
        event.preventDefault();
        openRefactor(null);
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [openRefactor]);
  const handleOpenUrl = useCallback((url: string) => {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  return {
    scrollRequest,
    resetScroll,
    revealRequest,
    openPathRequest,
    pendingXrefLine,
    handleScrollLine,
    handleLineClick,
    handleNavigateToFile,
    handleNavigateToXref,
    handleOpenUrl,
    goToSymbolOpen,
    setGoToSymbolOpen,
    symbolPathOf,
    handleSelectSymbol,
    refactorOpen,
    setRefactorOpen,
    refactorInitial,
    openRefactor,
    handleNavigateToUsage,
    handleSymbolRenamed,
  };
}
