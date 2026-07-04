import { EditorView } from '@codemirror/view';
import { resolveIncludeTarget, resolveImageTarget, NO_ATTRIBUTES } from '@/lib/asciidoc/include-path';
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
// An attribute REFERENCE `{name}` (word chars only — never matches a `{set:name:value}` assignment,
// which contains `:`). Ctrl+clicking one jumps to where the attribute is defined.
const ATTR_REF = /\{([A-Za-z0-9][\w-]*)\}/g;

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
   * project symbol index.
   *
   * @param target - The resolved definition location.
   */
  onNavigateToXref?: (target: XrefTarget) => void;
}

/** A resolved cross-reference definition location. */
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
 * Find the cross-reference token covering `posInLine`, returning its raw target and the token's
 * character range within the line, or null. Position-aware so it never shadows other macros.
 */
function xrefAt(lineText: string, posInLine: number): { target: string; start: number; end: number } | null {
  for (const pattern of [XREF_ANGLE, XREF_MACRO]) {
    for (const match of lineText.matchAll(new RegExp(pattern.source, 'g'))) {
      if (match.index !== undefined && posInLine >= match.index && posInLine < match.index + match[0].length) {
        return { target: match[1], start: match.index, end: match.index + match[0].length };
      }
    }
  }
  return null;
}

/** Resolve a raw xref target (`id` or `path#id`) to its definition location via the index. */
function resolveXrefTarget(rawTarget: string, index: ProjectSymbolIndex): XrefTarget | null {
  const id = rawTarget.includes('#') ? rawTarget.slice(rawTarget.lastIndexOf('#') + 1) : rawTarget;
  const symbol = index.resolveXref(id);
  if (symbol === 'unresolved') return null;
  return {
    fileId: symbol.fileId,
    path: index.pathOf(symbol.fileId),
    line: index.lineOf(symbol.fileId, symbol.range.from),
    sameFile: symbol.fileId === index.activeFileId,
  };
}

/**
 * Find the attribute-reference token `{name}` covering `posInLine`, returning the attribute name and
 * the token's character range within the line, or null. Position-aware so it never shadows other
 * tokens on the line.
 */
function attributeReferenceAt(lineText: string, posInLine: number): { name: string; start: number; end: number } | null {
  for (const match of lineText.matchAll(new RegExp(ATTR_REF.source, 'g'))) {
    if (match.index !== undefined && posInLine >= match.index && posInLine < match.index + match[0].length) {
      return { name: match[1], start: match.index, end: match.index + match[0].length };
    }
  }
  return null;
}

/**
 * Resolve an attribute reference `{name}` to where it is DEFINED via the index — a `:name:` entry or
 * an inline `{set:name:…}`, in the current file OR any file in the include tree.
 * Reuses {@link XrefTarget} because go-to-definition navigation is identical (open the defining file
 * if different, reveal the line). Returns null when the attribute is not defined anywhere reachable.
 */
function resolveAttributeTarget(name: string, index: ProjectSymbolIndex): XrefTarget | null {
  const symbol = index.resolveAttribute(name);
  if (symbol === 'unresolved') return null;
  return {
    fileId: symbol.fileId,
    path: index.pathOf(symbol.fileId),
    line: index.lineOf(symbol.fileId, symbol.range.from),
    sameFile: symbol.fileId === index.activeFileId,
  };
}

/** A hover preview for the cross-reference under the cursor: tooltip text + token range. */
export interface XrefHoverPreview {
  /** The preview text (resolved location, or an "unknown reference" notice). */
  text: string;
  /** Start offset of the xref token within the line. */
  from: number;
  /** End offset of the xref token within the line. */
  to: number;
}

/**
 * Build a hover preview for the cross-reference at `posInLine`, or null when none is there.
 * Resolved targets describe the definition's location; unresolved ones say so.
 *
 * @param lineText - The hovered line's text.
 * @param posInLine - The hover offset within the line.
 * @param index - The project symbol index.
 * @returns The preview, or null when the cursor is not over an xref.
 */
export function xrefHoverPreview(
  lineText: string,
  posInLine: number,
  index: ProjectSymbolIndex,
): XrefHoverPreview | null {
  const at = xrefAt(lineText, posInLine);
  if (!at) return null;
  const target = resolveXrefTarget(at.target, index);
  const text = target
    ? `${target.sameFile ? 'Definition in this file' : target.path ?? 'Definition'} · line ${target.line}`
    : `Unknown cross-reference: ${at.target}`;
  return { text, from: at.start, to: at.end };
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
      const at = xrefAt(lineText, pos - lineObject.from);
      if (at) {
        const target = resolveXrefTarget(at.target, index);
        if (target) {
          callbacks.onNavigateToXref?.(target);
          event.preventDefault?.();
        }
        return;
      }
    }

    // Resolve an include::/image:: target for navigation — exactly one Asciidoctor-correct resolution,
    // no fallbacks. `include::` resolves relative to the open (including) file; `image::` resolves
    // relative to the project root + `:imagesdir:` (its base directory is the document root, not the
    // macro's folder). `{attr}` references are substituted by the resolvers.
    //   'ok' → navigate; 'unresolved' → report; 'ignore' → unsafe/out-of-sandbox target, do nothing.
    const resolveNavTarget = (
      rawPath: string,
      kind: 'include' | 'image',
    ): { status: 'ok'; path: string } | { status: 'unresolved' } | { status: 'ignore' } => {
      const attributes = index ? index.effectiveAttributes(index.activeFileId) : NO_ATTRIBUTES;
      const resolved =
        kind === 'image'
          ? resolveImageTarget(rawPath, attributes)
          : resolveIncludeTarget(index?.pathOf(index.activeFileId) ?? '', rawPath, attributes);
      if (!resolved.ok) return { status: 'ignore' };
      if (currentPaths && !currentPaths.includes(resolved.path)) return { status: 'unresolved' };
      return { status: 'ok', path: resolved.path };
    };

    const navigate = (rawPath: string, kind: 'include' | 'image'): void => {
      const resolution = resolveNavTarget(rawPath, kind);
      if (resolution.status === 'ignore') return;
      if (resolution.status === 'unresolved') {
        callbacks.onUnresolvedPath?.(rawPath);
        return;
      }
      callbacks.onNavigateToFile?.(resolution.path);
      event.preventDefault?.();
    };

    const includeMatch = INCLUDE_MACRO.exec(lineText);
    if (includeMatch) {
      navigate(includeMatch[1], 'include');
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
      navigate(rawPath, 'image');
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

    // Attribute go-to-definition: Ctrl+click `{name}` jumps to its `:name:` / `{set:name:…}` definition,
    // in this file or another file in the include tree. Checked LAST — after the macros —
    // so a `{attr}` INSIDE an `include::{attr}/x.adoc[]` target still navigates the include (which
    // substitutes the attribute in its path), not the attribute definition. Position-aware, reusing the
    // same definition-navigation callback as xrefs.
    if (index) {
      const attributeAt = attributeReferenceAt(lineText, posInLine);
      if (attributeAt) {
        const target = resolveAttributeTarget(attributeAt.name, index);
        if (target) {
          callbacks.onNavigateToXref?.(target);
          event.preventDefault?.();
        }
      }
    }
  }

  return { handleMousedown };
}
