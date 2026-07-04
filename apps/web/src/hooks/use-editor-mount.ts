'use client';
import { useEffect, useRef, useCallback } from 'react';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { refreshHeadingLevelsEffect } from '@/lib/codemirror/asciidoc-heading-levels';
import { refreshAttributeFoldEffect } from '@/lib/codemirror/asciidoc-attribute-fold';
import { setInheritedAttributesEffect } from '@/lib/codemirror/inherited-attributes-field';
import { refreshCrossDocumentAttributesEffect } from '@/lib/codemirror/cross-document-attributes';
import type { ProjectSymbolIndex } from '@/lib/codemirror/asciidoc-symbol-index';
import { RENDER_INTRINSIC_ATTRIBUTES } from '@/lib/asciidoc/render-intrinsics';
import { createLinkHandler, type XrefTarget } from '@/lib/codemirror/asciidoc-link-handler';
import { outlineField } from '@/lib/codemirror/asciidoc-outline';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import { buildEditorExtensions } from '@/lib/codemirror/editor-extensions';
import { createSpellcheckLinter } from '@/lib/codemirror/editor-spellcheck-linter';
import {
  createLineClickHandler,
  createFileDropHandler,
  createCtrlClickTooltip,
  wireScrollSync,
} from '@/lib/codemirror/editor-dom-handlers';

/**
 * Clamps a remembered 1-based line number to the document's valid range — the "closest
 * valid line" rule, applied when restoring a cursor that may exceed the current document length.
 *
 * @param line - The remembered 1-based line number.
 * @param totalLines - The document's current line count.
 * @returns A line number within `[1, totalLines]`.
 */
function clampToValidLine(line: number, totalLines: number): number {
  return Math.min(Math.max(line, 1), totalLines);
}

/** Stable empty default for the inherited-attributes prop (avoids a new map identity per render). */
const EMPTY_INHERITED_ATTRIBUTES: ReadonlyMap<string, string> = new Map();

/** Lowercase the keys of an attribute map into a name set (Asciidoctor matches names case-insensitively). */
function toLowercaseNames(scope: ReadonlyMap<string, string>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const name of scope.keys()) names.add(name.toLowerCase());
  return names;
}

interface UseEditorMountOptions {
  content: string;
  canEdit: boolean;
  softWrap?: boolean;
  /** Persistence key for per-file fold state; omitted ⇒ folds not persisted. */
  foldStorageKey?: string;
  /** Per-user spell-check ignore list. */
  spellIgnore?: string[];
  /** Document language for spell-check (ISO 639-1); defaults to 'en'. */
  spellcheckLanguage?: string;
  /** When false, spell-check produces no diagnostics regardless of language. Defaults to true. */
  spellcheckEnabled?: boolean;
  /**
   * Uploads a pasted/dropped image.
   *
   * @param file - The image file to upload.
   * @returns The inserted project-relative path, or null on failure.
   */
  uploadImage?: (file: File) => Promise<string | null>;
  includePaths: string[];
  imagePaths?: string[];
  /**
   * Live accessor for the cross-file project symbol index. Diagnostics and
   * xref/attribute completion consult it for cross-file targets; null ⇒ current-file
   * scope. The getter is captured once at mount and always returns the latest index.
   */
  getProjectIndex?: () => ProjectSymbolIndex | null;
  onDocChange: (content: string) => void;
  onCursorChange: (pos: { line: number; col: number; totalLines: number }) => void;
  onOutlineChange: (entries: SectionOutlineEntry[]) => void;
  onNavigateToFile?: (path: string) => void;
  onOpenUrl?: (url: string) => void;
  // Navigate to a cross-reference definition resolved via the project symbol index.
  onNavigateToXref?: (target: XrefTarget) => void;
  /**
   * Include-path level offset inherited by the open file from its ancestors. A change
   * to it after a main-file reconfiguration re-evaluates heading levels without a document edit.
   */
  inheritedOffset?: number;
  /**
   * Attributes the open file inherits from the documents that include it. They seed
   * the `{attr}` collapse-to-value display so cross-document references resolve; a change after the
   * symbol index rebuilds re-evaluates the display without a document edit.
   */
  inheritedAttributes?: ReadonlyMap<string, string>;
  /**
   * The open file's RESOLVED cross-document attribute scope (its inherited attributes merged with
   * its own definitions) — used to highlight `{name}` references that resolve anywhere in the
   * include tree as known. A change after the symbol index rebuilds re-evaluates the
   * highlighting without a document edit.
   */
  resolvedScope?: ReadonlyMap<string, string>;
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
   * Live request to reveal a 1-based line in the already-mounted editor (same-file go-to-definition).
   * Each distinct `nonce` triggers one cursor move + scroll-into-view; clamped to the doc.
   */
  revealRequest?: { line: number; nonce: number } | null;
  /**
   * Collaboration binding extension (yCollab) for the collab path. When provided the editor
   * mounts with an EMPTY document and is populated from Yjs sync; native CodeMirror
   * history is omitted to avoid double-undo (per-user undo is handled by the Yjs UndoManager).
   */
  collabExtension?: Extension;
  /**
   * The in-editor symbol rename-suggestion extension (feature 033). Built once by the editor with
   * stable getters, so it never forces a remount; omitted ⇒ no rename suggestions.
   */
  renameSuggestionExtension?: Extension;
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
  spellcheckLanguage = 'en',
  spellcheckEnabled = true,
  uploadImage,
  includePaths,
  imagePaths = [],
  getProjectIndex,
  onDocChange,
  onCursorChange,
  onOutlineChange,
  onNavigateToFile,
  onOpenUrl,
  onNavigateToXref,
  inheritedOffset = 0,
  inheritedAttributes = EMPTY_INHERITED_ATTRIBUTES,
  resolvedScope = EMPTY_INHERITED_ATTRIBUTES,
  onLineClick,
  onScrollLine,
  initialLine,
  revealRequest,
  collabExtension,
  renameSuggestionExtension,
  remountKey,
}: UseEditorMountOptions) {
  const collabActive = collabExtension !== undefined;
  const containerReference = useRef<HTMLDivElement>(null);
  const viewReference = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());
  const languageCompartment = useRef(new Compartment());
  const lineWrapCompartment = useRef(new Compartment());
  const spellcheckCompartment = useRef(new Compartment());
  const includePathsReference = useRef<string[]>(includePaths);
  useEffect(() => { includePathsReference.current = includePaths; }, [includePaths]);
  const imagePathsReference = useRef<string[]>(imagePaths);
  useEffect(() => { imagePathsReference.current = imagePaths; }, [imagePaths]);
  const onLineClickReference = useRef(onLineClick);
  useEffect(() => { onLineClickReference.current = onLineClick; }, [onLineClick]);
  const onScrollLineReference = useRef(onScrollLine);
  useEffect(() => { onScrollLineReference.current = onScrollLine; }, [onScrollLine]);
  const getProjectIndexReference = useRef(getProjectIndex);
  useEffect(() => { getProjectIndexReference.current = getProjectIndex; }, [getProjectIndex]);
  const projectIndexAccessor = (): ProjectSymbolIndex | null => getProjectIndexReference.current?.() ?? null;
  // The open file's project-relative path (from the symbol index), used to write include::/image::
  // targets relative to the authoring file — AsciiDoc resolves directives relative to it, not the root.
  const currentFilePath = (): string | null => {
    const index = projectIndexAccessor();
    return index ? index.pathOf(index.activeFileId) : null;
  };
  // Attribute map in scope for the open file (its own definitions plus those inherited from the
  // files that include it) — for `{attr}` / `imagesdir` substitution in this file's macro targets.
  const currentAttributes = (): ReadonlyMap<string, string> => {
    const index = projectIndexAccessor();
    return index ? index.effectiveAttributes(index.activeFileId) : new Map();
  };
  const inheritedOffsetReference = useRef(inheritedOffset);
  useEffect(() => { inheritedOffsetReference.current = inheritedOffset; }, [inheritedOffset]);
  // Attributes inherited from including documents, seeding the `{attr}` collapse-to-value display.
  const inheritedAttributesReference = useRef(inheritedAttributes);
  useEffect(() => { inheritedAttributesReference.current = inheritedAttributes; }, [inheritedAttributes]);
  // Lowercase names known anywhere in the include tree, for known-vs-unknown `{name}` highlighting.
  // A reference is "known" when the attribute is defined ANYWHERE in the tree — in a
  // parent/including file OR in an included file — so this uses the index's
  // project-wide `attributes` view, not the position-aware resolved scope (which omits a descendant's
  // definitions). Recomputed when the index rebuilds (the resolvedScope prop changes identity then).
  const knownAttributeNames = (): ReadonlySet<string> => {
    const index = projectIndexAccessor();
    return index?.attributes ? toLowercaseNames(index.attributes) : new Set<string>();
  };
  const crossDocumentNamesReference = useRef<ReadonlySet<string>>(knownAttributeNames());
  useEffect(() => { crossDocumentNamesReference.current = knownAttributeNames(); }, [resolvedScope]);
  // The full resolved cross-document scope (name → value), read by the section outline to resolve
  // `{attr}` titles and exclude inactive conditional-branch headings.
  const resolvedScopeReference = useRef<ReadonlyMap<string, string>>(resolvedScope);
  useEffect(() => { resolvedScopeReference.current = resolvedScope; }, [resolvedScope]);
  // Keep onOutlineChange in a ref so the refresh effects below can re-publish the outline without
  // listing the callback in their deps (it is captured once at mount for the update listener).
  const onOutlineChangeReference = useRef(onOutlineChange);
  useEffect(() => { onOutlineChangeReference.current = onOutlineChange; }, [onOutlineChange]);
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
        // cursor line is restored when content FIRST arrives (not merely on `synced`,
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

    // DOM-level handlers + Ctrl+click hover tooltip. Each closes over a live ref accessor so it
    // always observes the latest prop without rebinding (see editor-dom-handlers.ts).
    const lineClickHandler = createLineClickHandler(() => onLineClickReference.current);
    const fileDropHandler = createFileDropHandler(currentFilePath, currentAttributes);
    const ctrlClickTooltip = createCtrlClickTooltip(projectIndexAccessor);

    const state = EditorState.create({
      // Collab path mounts EMPTY; yCollab populates from the synced Y.Text (B3).
      doc: collabActive ? '' : content,
      extensions: buildEditorExtensions({
        compartments: {
          readOnly: readOnlyCompartment.current,
          language: languageCompartment.current,
          lineWrap: lineWrapCompartment.current,
          spellcheck: spellcheckCompartment.current,
        },
        canEdit,
        softWrap,
        foldStorageKey: foldStorageKey ?? null,
        getSpellIgnore: () => spellIgnore ?? [],
        spellcheckLanguage,
        spellcheckEnabled,
        uploadImage,
        getIncludePaths: () => includePathsReference.current,
        getImagePaths: () => imagePathsReference.current,
        getCurrentFilePath: currentFilePath,
        getCurrentAttributes: currentAttributes,
        getInheritedAttributes: () => inheritedAttributesReference.current,
        getCrossDocumentAttributeNames: () => crossDocumentNamesReference.current,
        getOutlineResolvedScope: () => resolvedScopeReference.current,
        projectIndexAccessor,
        getInheritedOffset: () => inheritedOffsetReference.current,
        getIncludeContext: () => {
          const index = projectIndexAccessor();
          if (!index) return null;
          return {
            fileId: index.activeFileId,
            getContent: (id) => index.getContent(id),
            resolveInclude: (fromId, target) => index.resolveInclude(fromId, target),
            // Gating seed for conditional includes: the render intrinsics (e.g. `backend-html5`) plus
            // the open file's inherited attributes, so an `ifdef`/`ifeval`-guarded include is gated in
            // the editor exactly as the preview renders it — keeping their effective heading levels in
            // lockstep (R2). Matches the seed the preview worker/assembler and effectiveLevelOffset use.
            seedAttributes: new Map<string, string>([
              ...RENDER_INTRINSIC_ATTRIBUTES,
              ...inheritedAttributesReference.current,
            ]),
          };
        },
        collabActive,
        collabExtension,
        hookExtensions: [
          updateListener,
          lineClickHandler,
          fileDropHandler,
          ctrlClickTooltip,
          ...(renameSuggestionExtension ? [renameSuggestionExtension] : []),
        ],
      }),
    });

    const view = new EditorView({ state, parent: containerReference.current });
    viewReference.current = view;
    try { onOutlineChange(view.state.field(outlineField)); } catch { /* field not installed */ }
    // Seed the shared inherited-attributes field so heading-id derivation (rename detection, xref
    // completion) reflects a parent-set idprefix/idseparator/sectids, matching the server + preview.
    // Needed on (re)mount because the [inheritedAttributes] effect below does not re-run on a remount
    // whose inheritedAttributes identity is unchanged. Kept fresh afterward by that effect.
    view.dispatch({ effects: setInheritedAttributesEffect.of(inheritedAttributesReference.current) });

    // Restore the cursor to a remembered line on mount, clamped to the current document
    // ("closest valid line"), and scroll it into view. Only runs when initialLine is
    // provided — ordinary in-session mounts are unaffected. Skipped on the collab path: the
    // doc mounts empty and is populated by Yjs sync, so the restore is deferred until after
    // sync (handled by the editor component once `connectionState` reaches `synced`).
    if (initialLine !== undefined && !collabActive) {
      const targetLine = clampToValidLine(initialLine, view.state.doc.lines);
      view.dispatch({ selection: { anchor: view.state.doc.line(targetLine).from }, scrollIntoView: true });
    }

    // Scroll sync: fire onScrollLine with the 1-based line at the top of the viewport.
    const teardownScrollSync = wireScrollSync(view, () => onScrollLineReference.current);

    const linkHandler = createLinkHandler(
      {
        onNavigateToFile,
        onOpenUrl,
        onNavigateToXref,
        onUnresolvedPath: (path) => {
          globalThis.dispatchEvent(new CustomEvent('editor:unresolved-path', { detail: path }));
        },
      },
      () => includePathsReference.current,
      projectIndexAccessor,
    );
    const mousedownFunction = (event: MouseEvent) => linkHandler.handleMousedown(event, view);
    view.dom.addEventListener('mousedown', mousedownFunction);

    return () => {
      teardownScrollSync();
      view.dom.removeEventListener('mousedown', mousedownFunction);
      view.destroy();
      viewReference.current = null;
      onOutlineChange([]);
    };
    // Mount once per editor instance; recreate only when remountKey changes (collab room
    // switch). content/canEdit changes are handled by their own effects below. Other closure
    // values are intentionally captured at (re)mount time.
  }, [remountKey]);

  // Live reveal: move the cursor to a requested line and scroll it into view (same-file
  // go-to-definition). Runs on the already-mounted view; each new nonce reveals once.
  const revealedNonceReference = useRef<number | null>(null);
  useEffect(() => {
    const view = viewReference.current;
    if (!view || !revealRequest || revealRequest.nonce === revealedNonceReference.current) return;
    revealedNonceReference.current = revealRequest.nonce;
    const targetLine = clampToValidLine(revealRequest.line, view.state.doc.lines);
    view.dispatch({ selection: { anchor: view.state.doc.line(targetLine).from }, scrollIntoView: true });
  }, [revealRequest]);

  // Re-evaluate heading levels when the inherited include-path offset changes (e.g. the project
  // main file was reconfigured) — no document edit occurs, so the plugin needs an explicit nudge.
  // The refresh effect recomputes the outline StateField (effective levels), so re-publish it: the
  // mount update listener only fires onOutlineChange on a doc edit, not on an out-of-band refresh.
  useEffect(() => {
    const view = viewReference.current;
    if (!view) return;
    view.dispatch({ effects: refreshHeadingLevelsEffect.of() });
    try { onOutlineChangeReference.current(view.state.field(outlineField)); } catch { /* field not installed */ }
  }, [inheritedOffset]);

  // Re-evaluate the `{attr}` collapse-to-value display when the inherited attributes change (e.g. a
  // parent file's content loaded into the index) — no document edit occurs, so nudge the plugin.
  useEffect(() => {
    viewReference.current?.dispatch({
      effects: [refreshAttributeFoldEffect.of(), setInheritedAttributesEffect.of(inheritedAttributes)],
    });
  }, [inheritedAttributes]);

  // Re-evaluate the cross-document `{name}` known-vs-unknown highlighting when the resolved scope
  // changes (e.g. a parent/included file's content loaded into the index, or the main file was
  // reconfigured) — no document edit occurs, so nudge the plugin explicitly. The
  // section outline also derives from the resolved scope (it resolves `{attr}` titles and excludes
  // inactive conditional-branch headings), so route the shared refreshHeadingLevelsEffect through it
  // and re-publish the recomputed outline — keeping computeHeadingLevels the single
  // recompute trigger for the outline field.
  useEffect(() => {
    const view = viewReference.current;
    if (!view) return;
    view.dispatch({
      effects: [refreshCrossDocumentAttributesEffect.of(), refreshHeadingLevelsEffect.of()],
    });
    try { onOutlineChangeReference.current(view.state.field(outlineField)); } catch { /* field not installed */ }
  }, [resolvedScope]);

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

  // Sync the soft-wrap preference live via its Compartment.
  useEffect(() => {
    if (!viewReference.current) return;
    viewReference.current.dispatch({
      effects: lineWrapCompartment.current.reconfigure(softWrap ? [EditorView.lineWrapping] : []),
    });
  }, [softWrap]);

  // Sync the spell-check language / enabled preference live via its Compartment —
  // a fresh lint source bound to the new language+enabled, so changes apply without a remount.
  useEffect(() => {
    if (!viewReference.current) return;
    viewReference.current.dispatch({
      effects: spellcheckCompartment.current.reconfigure(
        createSpellcheckLinter(() => spellIgnore ?? [], spellcheckLanguage, spellcheckEnabled),
      ),
    });
  }, [spellcheckLanguage, spellcheckEnabled, spellIgnore]);

  return { containerReference, viewReference, handleHeadingClick };
}
