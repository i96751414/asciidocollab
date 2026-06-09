'use client';
import { useEffect, useRef, useCallback } from 'react';
import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { autocompletion } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter } from '@codemirror/language';
import { showMinimap } from '@replit/codemirror-minimap';
import { asciidoc } from '@/lib/codemirror/asciidoc-language';
import { asciidocHighlightStyle } from '@/lib/codemirror/asciidoc-highlight';
import { asciidocTheme } from '@/lib/codemirror/asciidoc-theme';
import { asciidocFold } from '@/lib/codemirror/asciidoc-fold';
import {
  attributeCompletionSource,
  xrefCompletionSource,
  createIncludeCompletionSource,
  createImageCompletionSource,
  tableSnippetCompletionSource,
  tableCellCompletionSource,
  captionCompletionSource,
} from '@/lib/codemirror/asciidoc-completions';
import { createLinkHandler } from '@/lib/codemirror/asciidoc-link-handler';
import { outlineField } from '@/lib/codemirror/asciidoc-outline';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import { tableContextField } from '@/lib/codemirror/asciidoc-table-context';

/**
 * Clamps a remembered 1-based line number to the document's valid range — the FR-005 "closest
 * valid line" rule, applied when restoring a cursor that may exceed the current document length.
 *
 * @param line - The remembered 1-based line number.
 * @param totalLines - The document's current line count.
 * @returns A line number within `[1, totalLines]`.
 */
function clampToValidLine(line: number, totalLines: number): number {
  return Math.min(Math.max(line, 1), totalLines);
}

interface UseEditorMountOptions {
  content: string;
  canEdit: boolean;
  softWrap?: boolean;
  includePaths: string[];
  imagePaths?: string[];
  onDocChange: (content: string) => void;
  onCursorChange: (pos: { line: number; col: number; totalLines: number }) => void;
  onOutlineChange: (entries: SectionOutlineEntry[]) => void;
  onNavigateToFile?: (path: string) => void;
  onOpenUrl?: (url: string) => void;
  onLineClick?: (line: number) => void;
  /**
   * Called with the 1-based line at the top of the editor viewport as the user scrolls.
   *
   * @param line - The 1-based line number at the top of the visible viewport.
   */
  onScrollLine?: (line: number) => void;
  /**
   * 1-based line to place the cursor on when the editor mounts (selection restore). Clamped
   * to the current document's line count ("closest valid line"); ignored when not provided.
   */
  initialLine?: number;
  /**
   * Collaboration binding extension (yCollab) for the collab path. When provided the editor
   * mounts with an EMPTY document and is populated from Yjs sync (FR-004); native CodeMirror
   * history is omitted to avoid double-undo (per-user undo is handled by the Yjs UndoManager).
   */
  collabExtension?: Extension;
  /**
   * Forces the editor to recreate when it changes, such as the Yjs room id on a file switch, so
   * the collab binding rebinds to the new document. Stays undefined on the legacy path.
   */
  remountKey?: string;
}

/** Manages the full CodeMirror 6 view lifecycle: mount, teardown, content/readOnly sync. */
export function useEditorMount({
  content,
  canEdit,
  softWrap = true,
  includePaths,
  imagePaths = [],
  onDocChange,
  onCursorChange,
  onOutlineChange,
  onNavigateToFile,
  onOpenUrl,
  onLineClick,
  onScrollLine,
  initialLine,
  collabExtension,
  remountKey,
}: UseEditorMountOptions) {
  const collabActive = collabExtension !== undefined;
  const containerReference = useRef<HTMLDivElement>(null);
  const viewReference = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());
  const includePathsReference = useRef<string[]>(includePaths);
  useEffect(() => { includePathsReference.current = includePaths; }, [includePaths]);
  const imagePathsReference = useRef<string[]>(imagePaths);
  useEffect(() => { imagePathsReference.current = imagePaths; }, [imagePaths]);
  const onLineClickReference = useRef(onLineClick);
  useEffect(() => { onLineClickReference.current = onLineClick; }, [onLineClick]);
  const onScrollLineReference = useRef(onScrollLine);
  useEffect(() => { onScrollLineReference.current = onScrollLine; }, [onScrollLine]);
  // Tracks whether the collab cursor-line restore has fired for the current (re)mount.
  const collabLineRestoredReference = useRef(false);

  // Stable heading-click callback — viewReference is a ref, so no deps needed.
  const handleHeadingClick = useCallback((entry: { from: number }) => {
    if (viewReference.current) {
      viewReference.current.dispatch({
        selection: { anchor: entry.from },
        scrollIntoView: true,
      });
      viewReference.current.focus();
    }
  }, []);

  // Mount / teardown the EditorView once.
  useEffect(() => {
    if (!containerReference.current) return;
    collabLineRestoredReference.current = false;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onDocChange(update.state.doc.toString());
        try { onOutlineChange(update.state.field(outlineField)); } catch { /* field not installed */ }
        // Collab path: the editor mounts empty and is populated by Yjs sync, so the remembered
        // cursor line (FR-005) is restored when content FIRST arrives (not merely on `synced`,
        // which can precede the populating transaction), clamped to the populated document.
        // Scheduled to a microtask to avoid dispatching while an update is in progress.
        if (
          collabActive &&
          initialLine !== undefined &&
          !collabLineRestoredReference.current &&
          update.state.doc.length > 0
        ) {
          collabLineRestoredReference.current = true;
          queueMicrotask(() => {
            const view = viewReference.current;
            if (!view) return;
            const targetLine = clampToValidLine(initialLine, view.state.doc.lines);
            view.dispatch({ selection: { anchor: view.state.doc.line(targetLine).from }, scrollIntoView: true });
          });
        }
      }
      const head = update.state.selection.main.head;
      const line = update.state.doc.lineAt(head);
      onCursorChange({ line: line.number, col: head - line.from + 1, totalLines: update.state.doc.lines });
    });

    const lineClickHandler = EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!onLineClickReference.current) return;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return;
        const lineNumber = view.state.doc.lineAt(pos).number;
        onLineClickReference.current(lineNumber);
      },
    });

    const state = EditorState.create({
      // Collab path mounts EMPTY; yCollab populates from the synced Y.Text (FR-004/B3).
      doc: collabActive ? '' : content,
      extensions: [
        asciidoc(),
        syntaxHighlighting(asciidocHighlightStyle),
        syntaxHighlighting(defaultHighlightStyle),
        // Native history is omitted on the collab path (Yjs UndoManager owns undo there).
        ...(collabActive ? [] : [history()]),
        keymap.of([...defaultKeymap, ...(collabActive ? [] : historyKeymap), ...searchKeymap]),
        search({ top: true }),
        // readOnly blocks user input but not programmatic Yjs-applied updates, so observers
        // still see live remote edits (research D8); editable.of(false) also drops the caret/
        // contenteditable so there is no misleading editable affordance.
        readOnlyCompartment.current.of([
          EditorState.readOnly.of(!canEdit),
          EditorView.editable.of(canEdit),
        ]),
        lineNumbers(),
        highlightActiveLine(),
        asciidocFold,
        foldGutter(),
        outlineField,
        tableContextField,
        showMinimap.of({ create: () => { const dom = document.createElement('div'); return { dom }; } }),
        autocompletion({
          override: [
            attributeCompletionSource,
            xrefCompletionSource,
            createIncludeCompletionSource(() => includePathsReference.current),
            createImageCompletionSource(() => imagePathsReference.current),
            tableSnippetCompletionSource,
            tableCellCompletionSource,
            captionCompletionSource,
          ],
        }),
        ...(collabExtension ? [collabExtension] : []),
        updateListener,
        lineClickHandler,
        // Brand editor theme (chrome + syntax via --syntax-* vars), following light/dark
        // automatically. Prec.highest so its highlight wins over the highlighters above:
        // CodeMirror mounts higher-precedence style modules last, so they win the cascade.
        Prec.highest(asciidocTheme),
        ...(softWrap ? [EditorView.lineWrapping] : []),
      ],
    });

    const view = new EditorView({ state, parent: containerReference.current });
    viewReference.current = view;
    try { onOutlineChange(view.state.field(outlineField)); } catch { /* field not installed */ }

    // Restore the cursor to a remembered line on mount, clamped to the current document
    // ("closest valid line", FR-005), and scroll it into view. Only runs when initialLine is
    // provided — ordinary in-session mounts are unaffected. Skipped on the collab path: the
    // doc mounts empty and is populated by Yjs sync, so the restore is deferred until after
    // sync (handled by the editor component once `connectionState` reaches `synced`).
    if (initialLine !== undefined && !collabActive) {
      const targetLine = clampToValidLine(initialLine, view.state.doc.lines);
      view.dispatch({ selection: { anchor: view.state.doc.line(targetLine).from }, scrollIntoView: true });
    }

    // Scroll sync: fire onScrollLine with the 1-based line at the top of the viewport.
    let scrollDebounce: ReturnType<typeof setTimeout> | null = null;
    const handleEditorScroll = () => {
      if (!onScrollLineReference.current) return;
      if (scrollDebounce !== null) clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(() => {
        scrollDebounce = null;
        const rect = view.scrollDOM.getBoundingClientRect();
        const pos = view.posAtCoords({ x: rect.left + 1, y: rect.top + 1 });
        if (pos !== null) {
          onScrollLineReference.current?.(view.state.doc.lineAt(pos).number);
        }
      }, 50);
    };
    view.scrollDOM.addEventListener('scroll', handleEditorScroll, { passive: true });

    const linkHandler = createLinkHandler(
      {
        onNavigateToFile,
        onOpenUrl,
        onUnresolvedPath: (path) => {
          globalThis.dispatchEvent(new CustomEvent('editor:unresolved-path', { detail: path }));
        },
      },
      () => includePathsReference.current,
    );
    const mousedownFunction = (event: MouseEvent) => linkHandler.handleMousedown(event, view);
    view.dom.addEventListener('mousedown', mousedownFunction);

    return () => {
      if (scrollDebounce !== null) clearTimeout(scrollDebounce);
      view.scrollDOM.removeEventListener('scroll', handleEditorScroll);
      view.dom.removeEventListener('mousedown', mousedownFunction);
      view.destroy();
      viewReference.current = null;
      onOutlineChange([]);
    };
    // Mount once per editor instance; recreate only when remountKey changes (collab room
    // switch). content/canEdit changes are handled by their own effects below. Other closure
    // values are intentionally captured at (re)mount time.
  }, [remountKey]);

  // Sync external content changes into the live view. Skipped on the collab path —
  // yCollab owns the document content there (seeding from REST would desync, B3).
  useEffect(() => {
    if (collabActive) return;
    if (!viewReference.current) return;
    const current = viewReference.current.state.doc.toString();
    if (current !== content) {
      viewReference.current.dispatch({ changes: { from: 0, to: current.length, insert: content } });
    }
  }, [content, collabActive]);

  // Sync canEdit changes via the Compartment — no view recreation needed.
  useEffect(() => {
    if (!viewReference.current) return;
    viewReference.current.dispatch({
      effects: readOnlyCompartment.current.reconfigure([
        EditorState.readOnly.of(!canEdit),
        EditorView.editable.of(canEdit),
      ]),
    });
  }, [canEdit]);

  return { containerReference, viewReference, handleHeadingClick };
}
