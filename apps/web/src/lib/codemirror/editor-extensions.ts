import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { autocompletion } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { showMinimap } from '@replit/codemirror-minimap';
import { asciidoc } from '@/lib/codemirror/asciidoc-language';
import { asciidocTheme } from '@/lib/codemirror/asciidoc-theme';
import { asciidocFold } from '@/lib/codemirror/asciidoc-fold';
import { asciidocHeadingLevels, inheritedHeadingOffsetFacet, type IncludeResolutionContext } from '@/lib/codemirror/asciidoc-heading-levels';
import { asciidocAttributeFold } from '@/lib/codemirror/asciidoc-attribute-fold';
import { asciidocCrossDocumentAttributes } from '@/lib/codemirror/cross-document-attributes';
import { asciidocConditionalDimming } from '@/lib/codemirror/conditional-dimming';
import { asciidocBlockDecorations } from '@/lib/codemirror/asciidoc-block-decorations';
import { asciidocSourceHighlight } from '@/lib/codemirror/asciidoc-source-highlight';
import { foldControlsKeymap, foldPersistence } from '@/lib/codemirror/asciidoc-fold-persist';
import { formatKeymap, autoWrapInputHandler } from '@/lib/codemirror/asciidoc-format-keymap';
import { asciidocPasteHandlers } from '@/lib/codemirror/asciidoc-paste';
import { asciidocDiagnosticsSource } from '@/lib/codemirror/asciidoc-diagnostics';
import {
  createAttributeCompletionSource,
  createXrefCompletionSource,
  createIncludeCompletionSource,
  createImageCompletionSource,
  tableSnippetCompletionSource,
  tableCellCompletionSource,
  captionCompletionSource,
  sourceLanguageCompletionSource,
} from '@/lib/codemirror/asciidoc-completions';
import type { ProjectSymbolIndex } from '@/lib/codemirror/asciidoc-symbol-index';
import { outlineField, outlineResolvedScopeFacet } from '@/lib/codemirror/asciidoc-outline';
import { asciidocInlineStyleEmphasis } from '@/lib/codemirror/inline-style-registry';
import { tableContextField } from '@/lib/codemirror/asciidoc-table-context';
import { listContinuationKeymap } from '@/lib/codemirror/asciidoc-list-continuation';
import { createSpellcheckLinter } from '@/lib/codemirror/editor-spellcheck-linter';

/** The compartments the hook reconfigures live; created once per (re)mount and passed in here. */
export interface EditorCompartments {
  /** Read-only / editability compartment, reconfigured when `canEdit` toggles. */
  readOnly: Compartment;
  /** Language compartment, reconfigured by the source-highlight loader to force a re-parse (US5). */
  language: Compartment;
  /** Soft-wrap compartment, reconfigured when the soft-wrap preference toggles (US2/FR-007). */
  lineWrap: Compartment;
  /** Spell-check lint compartment, reconfigured when the language/enabled/ignore prefs change. */
  spellcheck: Compartment;
}

/** Inputs for {@link buildEditorExtensions}: compartments, live accessors, and per-mount flags. */
export interface BuildEditorExtensionsOptions {
  /** The live-reconfigurable compartments, created once per (re)mount by the hook. */
  compartments: EditorCompartments;
  /** Whether the editor is editable at mount (drives the readOnly compartment's initial value). */
  canEdit: boolean;
  /** Whether soft-wrap is enabled at mount (drives the lineWrap compartment's initial value). */
  softWrap: boolean;
  /** Persistence key for per-file fold state (US10); null ⇒ folds not persisted. */
  foldStorageKey: string | null;
  /** Returns the current spell-check ignore list. */
  getSpellIgnore: () => string[];
  /** Document language for spell-check (ISO 639-1). */
  spellcheckLanguage: string;
  /** When false, spell-check produces no diagnostics regardless of language. */
  spellcheckEnabled: boolean;
  /**
   * Uploads a pasted/dropped image (US9/FR-040).
   *
   * @param file - The image file to upload.
   * @returns The inserted project-relative path, or null on failure.
   */
  uploadImage?: (file: File) => Promise<string | null>;
  /** Returns the latest include paths for include:: completion. */
  getIncludePaths: () => string[];
  /** Returns the latest image paths for image:: completion. */
  getImagePaths: () => string[];
  /** Returns the open file's project-relative path, used to relativize include::/image:: targets. */
  getCurrentFilePath: () => string | null;
  /** Returns the project attribute map (supplies `imagesdir` for image-target relativization). */
  getCurrentAttributes: () => ReadonlyMap<string, string>;
  /**
   * Returns the attributes the open file inherits from the documents that include it, seeding the
   * `{attr}` collapse-to-value display so cross-document references resolve (US8/FR-045a).
   */
  getInheritedAttributes: () => ReadonlyMap<string, string>;
  /**
   * Returns the names (lowercase) KNOWN ANYWHERE in the include tree — the symbol index's project-wide
   * `attributes` view (every file's definitions unioned), used to highlight a `{name}` whose attribute
   * is defined in a parent (FR-020) OR an included file (FR-021) as known. Deliberately broader than
   * the position-resolved value scope ({@link BuildEditorExtensionsOptions.getOutlineResolvedScope} /
   * the `{attr}` fold), so a `{name}` can be highlighted-known yet not collapse to a value at a
   * reference above its definition.
   */
  getCrossDocumentAttributeNames: () => ReadonlySet<string>;
  /**
   * Returns the open file's RESOLVED cross-document attribute scope (lowercase name → value). The
   * section outline reads it to resolve `{attr}` references in heading titles and to evaluate
   * conditional (`ifdef`/`ifndef`/`ifeval`) regions so inactive-branch headings are excluded, keeping
   * the outline consistent with the rendered preview (R11/FR-032). Read lazily; the outline recomputes
   * via the shared {@link refreshHeadingLevelsEffect} when the resolved scope changes.
   */
  getOutlineResolvedScope: () => ReadonlyMap<string, string>;
  /** Returns the latest project symbol index (or null for current-file scope). */
  projectIndexAccessor: () => ProjectSymbolIndex | null;
  /** Returns the inherited include-path heading-level offset (US3/FR-071). */
  getInheritedOffset: () => number;
  /** Returns the include resolution context for heading-level include tracing, or null. */
  getIncludeContext?: () => IncludeResolutionContext | null;
  /** True on the collab path: native history is omitted (Yjs UndoManager owns undo). */
  collabActive: boolean;
  /** The collaboration binding extension, when present (collab path only). */
  collabExtension?: Extension;
  /** Extensions the hook builds that close over its refs (update listener, DOM handlers, tooltip). */
  hookExtensions: Extension[];
}

/**
 * Assembles the full CodeMirror extension array for the AsciiDoc editor. Pure with respect to React
 * — it receives the compartments, live accessors, and hook-owned extensions as inputs and returns
 * the array passed to {@link EditorState.create}. The ordering and precedence here are load-bearing
 * (see inline notes) and must match the live editor's behaviour exactly.
 *
 * @param options - Compartments, accessors, mount-time flags, and hook-owned extensions.
 * @returns The ordered extension array.
 */
export function buildEditorExtensions(options: BuildEditorExtensionsOptions): Extension[] {
  const {
    compartments,
    canEdit,
    softWrap,
    foldStorageKey,
    getSpellIgnore,
    spellcheckLanguage,
    spellcheckEnabled,
    uploadImage,
    getIncludePaths,
    getImagePaths,
    getCurrentFilePath,
    getCurrentAttributes,
    getInheritedAttributes,
    getCrossDocumentAttributeNames,
    getOutlineResolvedScope,
    projectIndexAccessor,
    getInheritedOffset,
    getIncludeContext,
    collabActive,
    collabExtension,
    hookExtensions,
  } = options;

  const nativeHistory = collabActive ? [] : [history()];
  const nativeHistoryKeymap = collabActive ? [] : historyKeymap;
  const collab = collabExtension ? [collabExtension] : [];

  return [
    // The language lives in a compartment so the source-highlight loader can
    // reconfigure it (forcing a re-parse) once an embedded language loads (US5).
    compartments.language.of(asciidoc()),
    // `{ fresh: true }`: reconfiguring with a NEW Language is what forces CodeMirror to restart
    // parsing so the just-loaded embedded parser is injected (see asciidoc-language.ts).
    asciidocSourceHighlight((view) =>
      view.dispatch({ effects: compartments.language.reconfigure(asciidoc({ fresh: true })) }),
    ),
    // asciidocTheme (Prec.highest, below) already includes syntaxHighlighting for the 030 style;
    // the legacy asciidocHighlightStyle registration was removed to prevent its span-level fontSize
    // specs from overriding the 030 line-level heading ramp (cm-ad-h* decorations).
    syntaxHighlighting(defaultHighlightStyle),
    // Native history is omitted on the collab path (Yjs UndoManager owns undo there).
    ...nativeHistory,
    // List auto-continuation Enter command — registered before defaultKeymap (and at
    // Prec.high) so it handles list lines first and all other lines fall through (FR-011).
    listContinuationKeymap,
    // Formatting shortcuts (Mod-b/i/`, Mod-/) + type-over-selection auto-wrap (US9).
    // Bound before defaultKeymap so they win without overriding save/find/undo.
    keymap.of([...formatKeymap]),
    autoWrapInputHandler,
    keymap.of([...defaultKeymap, ...nativeHistoryKeymap, ...searchKeymap]),
    search({ top: true }),
    // readOnly blocks user input but not programmatic Yjs-applied updates, so observers
    // still see live remote edits (research D8); editable.of(false) also drops the caret/
    // contenteditable so there is no misleading editable affordance.
    compartments.readOnly.of([
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
    foldPersistence(foldStorageKey),
    // Paste/drop conveniences: URL→link, HTML→AsciiDoc, image→upload+image:: (US9).
    asciidocPasteHandlers({ uploadImage }),
    // Prose spell-check (US9) + cross-file/structural diagnostics (US8):
    // each is its own lint source so they merge in the gutter/underlines.
    lintGutter(),
    compartments.spellcheck.of(
      createSpellcheckLinter(getSpellIgnore, spellcheckLanguage, spellcheckEnabled),
    ),
    linter(asciidocDiagnosticsSource(projectIndexAccessor)),
    // Effective heading-level styling (US3): raw level + in-file :leveloffset:.
    // Inherited (cross-file) offset is wired from the symbol index in US8/T066.
    asciidocHeadingLevels(getInheritedOffset, getIncludeContext),
    // Expose the same inherited offset to the outline StateField so it derives effective levels
    // (and the beyond-max / leveloffset rules) identically to the heading highlight.
    inheritedHeadingOffsetFacet.of(getInheritedOffset),
    // {attr} collapse-to-value display fold — source text unchanged (FR-057). Seeded with the
    // attributes inherited from including documents so cross-file references collapse too (US8).
    asciidocAttributeFold(getInheritedAttributes),
    // Mark `{name}` references that resolve in the file's RESOLVED cross-document scope (US6/FR-020),
    // so the theme can distinguish known cross-document references from unknown ones. The accessor is
    // read lazily; a refresh effect re-evaluates the marks live as the symbol index resolves values.
    asciidocCrossDocumentAttributes(getCrossDocumentAttributeNames),
    // Dim the content of inactive conditional branches (`ifdef`/`ifndef`/`ifeval`) so the editor
    // matches what the preview renders (US12/FR-032). The branch active/inactive decision evaluates
    // each region against the SAME resolved cross-document scope the outline uses to exclude
    // inactive-branch headings (`getOutlineResolvedScope` = inherited attributes + the file's own
    // definitions), so the dimming and the outline never disagree — e.g. a branch gated on a
    // locally-defined `:flag:` is both shown in the outline and left undimmed. It recomputes live on a
    // document edit and on the shared cross-document refresh effect (dispatched when the scope changes).
    asciidocConditionalDimming(getOutlineResolvedScope),
    // Give role spans `[.role]#…#` with a KNOWN inline style (built-in or registered) a distinct
    // emphasis on top of the grammar's generic role-span highlight (US14/FR-021c). Registering a new
    // role needs no change here — the decoration recomputes from the registry on each update.
    asciidocInlineStyleEmphasis(),
    // Recede block-title `.` markers and table `|` separators, and bold table header cells, layered
    // over the grammar's token colours (FR-031/046).
    asciidocBlockDecorations(),
    // Feed the section outline the file's resolved cross-document scope so it resolves `{attr}` titles
    // and excludes inactive conditional-branch headings (R11/FR-032); read lazily so the shared
    // refreshHeadingLevelsEffect re-evaluates it when the scope changes without a document edit.
    outlineResolvedScopeFacet.of(getOutlineResolvedScope),
    outlineField,
    tableContextField,
    showMinimap.of({ create: () => { const dom = document.createElement('div'); return { dom }; } }),
    autocompletion({
      override: [
        createAttributeCompletionSource(projectIndexAccessor),
        sourceLanguageCompletionSource,
        createXrefCompletionSource(projectIndexAccessor),
        createIncludeCompletionSource(getIncludePaths, getCurrentFilePath),
        createImageCompletionSource(getImagePaths, getCurrentAttributes),
        tableSnippetCompletionSource,
        tableCellCompletionSource,
        captionCompletionSource,
      ],
    }),
    ...collab,
    ...hookExtensions,
    // Brand editor theme (chrome + syntax via --syntax-* vars), following light/dark
    // automatically. Prec.highest so its highlight wins over the highlighters above:
    // CodeMirror mounts higher-precedence style modules last, so they win the cascade.
    Prec.highest(asciidocTheme),
    // Soft-wrap lives in a compartment so toggling the preference reconfigures
    // the live editor without a remount (US2/FR-007).
    compartments.lineWrap.of(softWrap ? [EditorView.lineWrapping] : []),
  ];
}
