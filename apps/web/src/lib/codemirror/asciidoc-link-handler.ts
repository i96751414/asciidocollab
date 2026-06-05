import { EditorView } from '@codemirror/view';

// Pattern matchers for different link types within a line of text
const INCLUDE_MACRO = /include::([^[\n]+)\[/;
const LINK_MACRO = /(?:link|image):([^[\n]+)\[/;
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

/** Creates a link handler that intercepts Ctrl+click events for include paths and URLs. */
export function createLinkHandler(
  callbacks: LinkHandlerCallbacks,
  availablePaths?: string[] | (() => string[]),
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
