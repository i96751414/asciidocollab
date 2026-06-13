'use client';
import { useEffect, useRef, useCallback } from 'react';
import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, hoverTooltip } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { autocompletion } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter } from '@codemirror/language';
import { showMinimap } from '@replit/codemirror-minimap';
import { asciidoc } from '@/lib/codemirror/asciidoc-language';
import { macroFromDropPayload, padBlockMacro, macroPathRange } from '@/lib/codemirror/asciidoc-file-drop';
import { asciidocHighlightStyle } from '@/lib/codemirror/asciidoc-highlight';
import { asciidocTheme } from '@/lib/codemirror/asciidoc-theme';
import { asciidocFold } from '@/lib/codemirror/asciidoc-fold';
import { asciidocHeadingLevels } from '@/lib/codemirror/asciidoc-heading-levels';
import { asciidocAttributeFold } from '@/lib/codemirror/asciidoc-attribute-fold';
import { asciidocSourceHighlight } from '@/lib/codemirror/asciidoc-source-highlight';
import { foldControlsKeymap, foldPersistence } from '@/lib/codemirror/asciidoc-fold-persist';
import { formatKeymap, autoWrapInputHandler } from '@/lib/codemirror/asciidoc-format-keymap';
import { asciidocPasteHandlers } from '@/lib/codemirror/asciidoc-paste';
import { asciidocSpellcheckSource } from '@/lib/codemirror/asciidoc-spellcheck';
import { asciidocDiagnosticsSource } from '@/lib/codemirror/asciidoc-diagnostics';
import { linter, lintGutter } from '@codemirror/lint';
import {
  attributeCompletionSource,
  xrefCompletionSource,
  createIncludeCompletionSource,
  createImageCompletionSource,
  tableSnippetCompletionSource,
  tableCellCompletionSource,
  captionCompletionSource,
  sourceLanguageCompletionSource,
} from '@/lib/codemirror/asciidoc-completions';
import { createLinkHandler } from '@/lib/codemirror/asciidoc-link-handler';
import { outlineField } from '@/lib/codemirror/asciidoc-outline';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import { tableContextField } from '@/lib/codemirror/asciidoc-table-context';
import { listContinuationKeymap } from '@/lib/codemirror/asciidoc-list-continuation';

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
  /** Persistence key for per-file fold state (US10); omitted ⇒ folds not persisted. */
  foldStorageKey?: string;
  /** Per-user spell-check ignore list (US9/FR-063). */
  spellIgnore?: string[];
  /**
   * Uploads a pasted/dropped image (US9/FR-040).
   *
   * @param file - The image file to upload.
   * @returns The inserted project-relative path, or null on failure.
   */
  uploadImage?: (file: File) => Promise<string | null>;
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
  foldStorageKey,
  spellIgnore,
  uploadImage,
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
  const languageCompartment = useRef(new Compartment());
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

    // Dropping a file from the tree inserts a macro: image:: for images, include:: otherwise.
    // The tree sets the project-relative path on a custom dataTransfer type (see file-tree.tsx).
    const fileDropHandler = EditorView.domEventHandlers({
      drop(event, view) {
        const raw = event.dataTransfer?.getData('application/x-asciidoc-node');
        if (!raw) return false; // not a tree-file drag — let CodeMirror handle it normally
        if (!view.state.facet(EditorView.editable)) return false; // read-only
        event.preventDefault();
        const macro = macroFromDropPayload(raw);
        if (macro === null) return true;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
        const { doc } = view.state;
        const charBefore = pos > 0 ? doc.sliceString(pos - 1, pos) : null;
        const charAfter = pos < doc.length ? doc.sliceString(pos, pos + 1) : null;
        const insert = padBlockMacro(macro, charBefore, charAfter);
        view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } });
        view.focus();
        return true;
      },
    });

    // Hover tooltip over include::/image:: paths advertising the Ctrl+click affordance.
    const ctrlClickTooltip = hoverTooltip((view, pos) => {
      const line = view.state.doc.lineAt(pos);
      const range = macroPathRange(line.text);
      if (!range) return null;
      const start = line.from + range.start;
      const end = line.from + range.end;
      if (pos < start || pos > end) return null;
      return {
        pos: start,
        end,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.textContent = `${navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'}+click to open in the file tree`;
          dom.style.padding = '2px 6px';
          dom.style.fontSize = '12px';
          return { dom };
        },
      };
    });

    const state = EditorState.create({
      // Collab path mounts EMPTY; yCollab populates from the synced Y.Text (FR-004/B3).
      doc: collabActive ? '' : content,
      extensions: [
        // The language lives in a compartment so the source-highlight loader can
        // reconfigure it (forcing a re-parse) once an embedded language loads (US5).
        languageCompartment.current.of(asciidoc()),
        asciidocSourceHighlight((view) =>
          view.dispatch({ effects: languageCompartment.current.reconfigure(asciidoc()) }),
        ),
        syntaxHighlighting(asciidocHighlightStyle),
        syntaxHighlighting(defaultHighlightStyle),
        // Native history is omitted on the collab path (Yjs UndoManager owns undo there).
        ...(collabActive ? [] : [history()]),
        // List auto-continuation Enter command — registered before defaultKeymap (and at
        // Prec.high) so it handles list lines first and all other lines fall through (FR-011).
        listContinuationKeymap,
        // Formatting shortcuts (Mod-b/i/`, Mod-/) + type-over-selection auto-wrap (US9).
        // Bound before defaultKeymap so they win without overriding save/find/undo.
        keymap.of([...formatKeymap]),
        autoWrapInputHandler,
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
        // Whole-document fold controls (fold-all/unfold-all/to-level) + per-file
        // fold persistence (US10).
        foldControlsKeymap,
        foldPersistence(foldStorageKey ?? null),
        // Paste/drop conveniences: URL→link, HTML→AsciiDoc, image→upload+image:: (US9).
        asciidocPasteHandlers({ uploadImage }),
        // Prose spell-check (US9) + cross-file/structural diagnostics (US8):
        // each is its own lint source so they merge in the gutter/underlines.
        lintGutter(),
        linter(asciidocSpellcheckSource(() => spellIgnore ?? [])),
        linter(asciidocDiagnosticsSource()),
        // Effective heading-level styling (US3): raw level + in-file :leveloffset:.
        // Inherited (cross-file) offset is wired from the symbol index in US8/T066.
        asciidocHeadingLevels(),
        // {attr} collapse-to-value display fold — source text unchanged (FR-057).
        asciidocAttributeFold,
        outlineField,
        tableContextField,
        showMinimap.of({ create: () => { const dom = document.createElement('div'); return { dom }; } }),
        autocompletion({
          override: [
            attributeCompletionSource,
            sourceLanguageCompletionSource,
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
        fileDropHandler,
        ctrlClickTooltip,
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
