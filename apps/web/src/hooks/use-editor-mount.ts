'use client';
import { useEffect, useRef, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { autocompletion } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter } from '@codemirror/language';
import { showMinimap } from '@replit/codemirror-minimap';
import { asciidoc } from '@/lib/codemirror/asciidoc-language';
import { asciidocHighlightStyle } from '@/lib/codemirror/asciidoc-highlight';
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
  includePaths: string[];
  imagePaths?: string[];
  onDocChange: (content: string) => void;
  onCursorChange: (pos: { line: number; col: number; totalLines: number }) => void;
  onOutlineChange: (entries: SectionOutlineEntry[]) => void;
  onNavigateToFile?: (path: string) => void;
  onOpenUrl?: (url: string) => void;
}

/** Manages the full CodeMirror 6 view lifecycle: mount, teardown, content/readOnly sync. */
export function useEditorMount({
  content,
  canEdit,
  includePaths,
  imagePaths = [],
  onDocChange,
  onCursorChange,
  onOutlineChange,
  onNavigateToFile,
  onOpenUrl,
}: UseEditorMountOptions) {
  const containerReference = useRef<HTMLDivElement>(null);
  const viewReference = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());
  const includePathsReference = useRef<string[]>(includePaths);
  useEffect(() => { includePathsReference.current = includePaths; }, [includePaths]);
  const imagePathsReference = useRef<string[]>(imagePaths);
  useEffect(() => { imagePathsReference.current = imagePaths; }, [imagePaths]);

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
      ],
    });

    const view = new EditorView({ state, parent: containerReference.current });
    viewReference.current = view;
    try { onOutlineChange(view.state.field(outlineField)); } catch { /* field not installed */ }

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
