import { EditorView } from '@codemirror/view';
import type { ProjectSymbolIndex } from './asciidoc-symbol-index';

// Pattern matchers for different link types within a line of text
const INCLUDE_MACRO = /include::([^[\n]+)\[/;
// Cross-references: angle-bracket `<<id>>` / `<<id,label>>` and the `xref:target[...]` macro.
const XREF_ANGLE = /<<([^<>,\]]+)(?:,[^<>]*)?>>/g;
const XREF_MACRO = /xref:([^\s[\]]+)\[[^\]]*\]/g;
// Block (image::) and inline (image:) image macros. A local target navigates to the file in the
// tree; an absolute http(s) target opens as a URL (handled in the matcher below).
const IMAGE_MACRO = /image::?([^[\n]+)\[/;
const LINK_MACRO = /link:([^[\n]+)\[/;
const BARE_URL = /https?:\/\/[^\s[\]<>]+/;

/** Callbacks for link navigation events from the editor. */
export interface LinkHandlerCallbacks {
  /**
   * Called when an include:: path is Ctrl+clicked and the file exists.
   *
   * @param path - The resolved file path.
   */
  onNavigateToFile?: (path: string) => void;
  /**
   * Called when a URL is Ctrl+clicked.
   *
   * @param url - The URL to open.
   */
  onOpenUrl?: (url: string) => void;
  /**
   * Called when an include:: path cannot be resolved.
   *
   * @param rawPath - The raw unresolved path.
   */
  onUnresolvedPath?: (rawPath: string) => void;
  /**
   * Called when a cross-reference (`<<id>>` / `xref:id[…]`) resolves to a definition via the
   * project symbol index (FR-034/049).
   *
   * @param target - The resolved definition location.
   */
  onNavigateToXref?: (target: XrefTarget) => void;
}

/** A resolved cross-reference definition location (FR-049). */
export interface XrefTarget {
  /** The file id where the definition lives. */
  fileId: string;
  /** The defining file's project-relative path, or null when unknown. */
  path: string | null;
  /** 1-based line of the definition within its file. */
  line: number;
  /** True when the definition is in the currently-open file (reveal in place). */
  sameFile: boolean;
}

/**
 * Find the cross-reference token covering `posInLine`, returning its raw target, or null.
 * Position-aware so it never shadows other macros elsewhere on the same line.
 */
function xrefTargetAt(lineText: string, posInLine: number): string | null {
  for (const pattern of [XREF_ANGLE, XREF_MACRO]) {
    for (const match of lineText.matchAll(new RegExp(pattern.source, 'g'))) {
      if (match.index !== undefined && posInLine >= match.index && posInLine < match.index + match[0].length) {
        return match[1];
      }
    }
  }
  return null;
}

/** Normalises and validates a path extracted from an include:: macro. Returns null if unsafe. */
function normalizePath(raw: string): string | null {
  let normalized: string;
  try {
    normalized = decodeURIComponent(raw);
  } catch {
    normalized = raw;
  }
  if (normalized.startsWith('/')) return null;
  const segments = normalized.split('/');
  for (const segment of segments) {
    if (segment === '..') return null;
  }
  return normalized;
}

/** Result of createLinkHandler — provides a mousedown handler for wiring via addEventListener. */
export interface LinkHandlerResult {
  /**
   * Handle a mousedown DOM event, potentially triggering navigation.
   *
   * @param event - The mouse event.
   * @param view - The editor view to query for document position.
   */
  handleMousedown: (event: MouseEvent, view: Pick<EditorView, 'state' | 'posAtCoords'>) => void;
}

/** Creates a link handler that intercepts Ctrl+click events for include paths, xrefs, and URLs. */
export function createLinkHandler(
  callbacks: LinkHandlerCallbacks,
  availablePaths?: string[] | (() => string[]),
  getIndex?: () => ProjectSymbolIndex | null,
): LinkHandlerResult {
  function handleMousedown(
    event: MouseEvent,
    view: Pick<EditorView, 'state' | 'posAtCoords'>,
  ): void {
    if (!(event.ctrlKey || event.metaKey)) return;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return;

    const lineObject = view.state.doc.lineAt(pos);
    const lineText = lineObject.text;
    const currentPaths = typeof availablePaths === 'function' ? availablePaths() : availablePaths;

    // Cross-reference go-to-definition is checked first because it is position-aware (only fires
    // when the cursor is within an xref token), so it never shadows macros elsewhere on the line.
    const index = getIndex?.() ?? null;
    if (index) {
      const rawTarget = xrefTargetAt(lineText, pos - lineObject.from);
      if (rawTarget !== null) {
        const id = rawTarget.includes('#') ? rawTarget.slice(rawTarget.lastIndexOf('#') + 1) : rawTarget;
        const symbol = index.resolveXref(id);
        if (symbol !== 'unresolved') {
          callbacks.onNavigateToXref?.({
            fileId: symbol.fileId,
            path: index.pathOf(symbol.fileId),
            line: index.lineOf(symbol.fileId, symbol.range.from),
            sameFile: symbol.fileId === index.activeFileId,
          });
          event.preventDefault?.();
        }
        return;
      }
    }

    const includeMatch = INCLUDE_MACRO.exec(lineText);
    if (includeMatch) {
      const rawPath = includeMatch[1];
      const normalized = normalizePath(rawPath);
      if (!normalized) return;
      if (currentPaths && !currentPaths.includes(normalized)) {
        callbacks.onUnresolvedPath?.(rawPath);
        return;
      }
      callbacks.onNavigateToFile?.(normalized);
      event.preventDefault?.();
      return;
    }

    const imageMatch = IMAGE_MACRO.exec(lineText);
    if (imageMatch) {
      const rawPath = imageMatch[1];
      // An absolute URL image is opened in the browser; a local target navigates to the tree file.
      if (/^https?:\/\//.test(rawPath)) {
        callbacks.onOpenUrl?.(rawPath);
        event.preventDefault?.();
        return;
      }
      const normalized = normalizePath(rawPath);
      if (!normalized) return;
      if (currentPaths && !currentPaths.includes(normalized)) {
        callbacks.onUnresolvedPath?.(rawPath);
        return;
      }
      callbacks.onNavigateToFile?.(normalized);
      event.preventDefault?.();
      return;
    }

    const linkMatch = LINK_MACRO.exec(lineText);
    if (linkMatch) {
      callbacks.onOpenUrl?.(linkMatch[1]);
      event.preventDefault?.();
      return;
    }

    const posInLine = pos - lineObject.from;
    for (const urlMatch of lineText.matchAll(new RegExp(BARE_URL.source, 'g'))) {
      if (urlMatch.index !== undefined && posInLine >= urlMatch.index && posInLine < urlMatch.index + urlMatch[0].length) {
        callbacks.onOpenUrl?.(urlMatch[0]);
        event.preventDefault?.();
        return;
      }
    }
  }

  return { handleMousedown };
}
