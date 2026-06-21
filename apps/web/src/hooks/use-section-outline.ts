'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { outlineField } from '@/lib/codemirror/asciidoc-outline';
import { refreshHeadingLevelsEffect } from '@/lib/codemirror/asciidoc-heading-levels';
import { assembleOutline } from '@/lib/outline/assemble-outline';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import type { UnresolvedInclude } from '@/workers/assemble-includes';

const EMPTY_OUTLINE: SectionOutlineEntry[] = [];
const EMPTY_SCOPE: ReadonlyMap<string, string> = new Map();
const EMPTY_UNRESOLVED: UnresolvedInclude[] = [];

/** Reads the current outline from the view, falling back to empty when the field is not installed. */
function readOutline(view: EditorView | null): SectionOutlineEntry[] {
  if (!view) return EMPTY_OUTLINE;
  try {
    return view.state.field(outlineField);
  } catch {
    return EMPTY_OUTLINE;
  }
}

/** Live accessors that let the outline reflect the open file's cross-document resolution state. */
export interface UseSectionOutlineOptions {
  /**
   * Returns the open file's RESOLVED cross-document attribute scope (lowercase name → value). The
   * outline uses it to resolve `{attr}` references in heading titles and to evaluate conditional
   * (`ifdef`/`ifndef`/`ifeval`) regions so inactive-branch headings are excluded (R11/FR-032).
   */
  getResolvedScope?: () => ReadonlyMap<string, string>;
  /**
   * Returns the include-path inherited heading-level offset for the open file (US3/FR-071). Supplied
   * so the hook can recompute effective levels when it changes (e.g. The project main file changed).
   */
  getInheritedOffset?: () => number;
  /**
   * Identity that changes whenever the resolved scope changes (e.g. An include-structure or main-file
   * change re-resolves the scope). When it changes the hook nudges the outline to recompute resolved
   * titles + inactive marking (FR-007a/FR-007b). Defaults to the result of {@link getResolvedScope}.
   */
  scopeVersion?: unknown;
  /**
   * Identity that changes whenever the inherited offset changes; when it changes the hook recomputes
   * effective levels (FR-007a/FR-007b). Defaults to the result of {@link getInheritedOffset}.
   */
  offsetVersion?: unknown;

  // ── Full-document scope inputs (full-outline across includes) ──

  /** User scope preference; defaults to 'current'. */
  scopePreference?: 'full' | 'current';
  /** Main document path; null or absent ⇒ current-file fallback. */
  rootFilePath?: string | null;
  /** Identity of the currently open file. */
  openFile?: { id: string; path: string };
  /**
   * Returns file content by project-relative path, or null if unavailable.
   *
   * @param path - Project-relative path of the file to read.
   */
  readFile?: (path: string) => string | null;
  /**
   * Returns the file node id for a project-relative path.
   *
   * @param path - Project-relative path to resolve to a node id.
   */
  fileIdForPath?: (path: string) => string;
  /**
   * Counter from {@link useProjectSymbolIndex} that increments whenever a reachable non-open file's
   * live Yjs content changes (FR-013a). When it changes, the hook schedules a ~400 ms debounced
   * recompute so the full-document outline reflects collaborators' edits without spamming
   * `assembleOutline` on every Yjs transaction (FR-013b).
   */
  reachableDocVersion?: number;
}

/** Structured result returned by {@link useSectionOutline}. */
export interface UseSectionOutlineResult {
  /** Section outline entries in document order. */
  entries: SectionOutlineEntry[];
  /** The effective scope after fallback resolution. */
  effectiveScope: 'full' | 'current';
  /** Unresolved includes (graceful degradation, FR-014). */
  unresolved: UnresolvedInclude[];
}

/**
 * Returns the live section outline for a CodeMirror view, kept in sync with the editor's resolved
 * cross-document state (R11). It:
 *
 *  - subscribes to view updates (event-driven, no polling) so the outline tracks doc edits and the
 *    out-of-band {@link refreshHeadingLevelsEffect} that fires when the include structure or project
 *    main-file setting changes (FR-007a/FR-007b);
 *  - dispatches {@link refreshHeadingLevelsEffect} when the inherited offset or resolved scope
 *    changes, so the single authority `computeHeadingLevels` re-runs without a document edit;
 *  - when `scopePreference='full'` and a valid root path / seam are provided, assembles the full
 *    document outline across include directives with provenance attribution (FR-001/FR-002).
 *
 * @param view - The mounted editor view, or null before mount.
 * @param options - Live accessors for the resolved scope, inherited offset, and full-scope inputs.
 * @returns `{ entries, effectiveScope, unresolved }` — always an object (never a plain array).
 */
export function useSectionOutline(
  view: EditorView | null,
  options: UseSectionOutlineOptions = {},
): UseSectionOutlineResult {
  const {
    getResolvedScope,
    getInheritedOffset,
    scopePreference,
    rootFilePath,
    openFile,
    readFile,
    fileIdForPath,
    reachableDocVersion,
  } = options;
  const scopeVersion = options.scopeVersion ?? (getResolvedScope ? getResolvedScope() : EMPTY_SCOPE);
  const offsetVersion = options.offsetVersion ?? (getInheritedOffset ? getInheritedOffset() : 0);

  const [cmEntries, setCmEntries] = useState<SectionOutlineEntry[]>(() => readOutline(view));

  // Nonce incremented by the debounce effect below; adding it to the assembled useMemo deps
  // ensures the memo recomputes after a reachable-doc update even when `readFile` is stable.
  const [recomputeNonce, setRecomputeNonce] = useState(0);
  // Keep a ref to the previous version so the effect only fires on genuine increments.
  const previousReachableDocumentVersionReference = useRef(reachableDocVersion ?? 0);

  // Install an updateListener once per view so the live outline is pushed into React state on any
  // view update (doc edit or refresh effect) — event-driven, never a timer (Issue 9). Guarded so
  // a mock view without reconfigure support degrades to a single read.
  useEffect(() => {
    if (!view) {
      setCmEntries(EMPTY_OUTLINE);
      return;
    }

    const updateListener = EditorView.updateListener.of((update) => {
      setCmEntries(readOutline(update.view));
    });

    try {
      view.dispatch({
        effects: StateEffect.appendConfig.of([updateListener]),
      });
    } catch {
      /* Mock/partial view without dispatch support — fall through to a single synchronous read. */
    }

    setCmEntries(readOutline(view));
  }, [view]);

  // When the inherited offset or resolved scope changes out-of-band, nudge `computeHeadingLevels`
  // to re-run so the outline reflects new effective levels, titles, and inactive-branch marking.
  useEffect(() => {
    if (!view) return;
    try {
      view.dispatch({ effects: refreshHeadingLevelsEffect.of() });
    } catch {
      /* Mock/partial view — refresh is a no-op; the synchronous read below still applies. */
    }
    setCmEntries(readOutline(view));
  }, [view, scopeVersion, offsetVersion]);

  // Debounced recompute: when `reachableDocVersion` increments (a collaborator edited an included
  // file), wait ~400 ms before recomputing so we don't call `assembleOutline` on every Yjs tx.
  // Skips version 0 (initial mount) and skips when not in full-scope mode.
  useEffect(() => {
    if (reachableDocVersion === undefined || reachableDocVersion === 0) return;
    if (reachableDocVersion === previousReachableDocumentVersionReference.current) return;
    previousReachableDocumentVersionReference.current = reachableDocVersion;
    const timer = setTimeout(() => { setRecomputeNonce((n) => n + 1); }, 400);
    return () => clearTimeout(timer);
  }, [reachableDocVersion]);

  // Full-document outline: assembled across include directives with provenance tags (FR-001/FR-002).
  // Computed synchronously via useMemo so it reacts to any input change (rootFilePath, openFile,
  // readFile content, resolvedScope) without a useEffect round-trip. `recomputeNonce` lets the
  // debounced reachable-doc path also trigger a recompute when `readFile` identity is stable.
  const assembled = useMemo(() => {
    if (scopePreference !== 'full') return null;
    if (!rootFilePath || !openFile || !readFile || !fileIdForPath) return null;
    return assembleOutline({
      rootPath: rootFilePath,
      openFilePath: openFile.path,
      openFileId: openFile.id,
      readFile,
      fileIdForPath,
      resolvedScope: getResolvedScope?.() ?? EMPTY_SCOPE,
      scopePreference: 'full',
    });
  }, [scopePreference, rootFilePath, openFile?.path, openFile?.id, readFile, fileIdForPath, scopeVersion, recomputeNonce]);

  if (assembled !== null && assembled.scope === 'full') {
    return { entries: assembled.entries, effectiveScope: 'full', unresolved: assembled.unresolved };
  }

  return { entries: cmEntries, effectiveScope: 'current', unresolved: EMPTY_UNRESOLVED };
}
