'use client';
import { useEffect, useRef, useCallback } from 'react';
import { EditorState, Compartment, Prec } from '@codemirror/state';
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
}: UseEditorMountOptions) {
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

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onDocChange(update.state.doc.toString());
        try { onOutlineChange(update.state.field(outlineField)); } catch { /* field not installed */ }
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
      doc: content,
      extensions: [
        asciidoc(),
        syntaxHighlighting(asciidocHighlightStyle),
        syntaxHighlighting(defaultHighlightStyle),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        search({ top: true }),
        readOnlyCompartment.current.of(EditorState.readOnly.of(!canEdit)),
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
  }, []); // mount once — content/canEdit changes are handled by their own effects below

  // Sync external content changes into the live view.
  useEffect(() => {
    if (!viewReference.current) return;
    const current = viewReference.current.state.doc.toString();
    if (current !== content) {
      viewReference.current.dispatch({ changes: { from: 0, to: current.length, insert: content } });
    }
  }, [content]);

  // Sync canEdit changes via the Compartment — no view recreation needed.
  useEffect(() => {
    if (!viewReference.current) return;
    viewReference.current.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(!canEdit)),
    });
  }, [canEdit]);

  return { containerReference, viewReference, handleHeadingClick };
}
