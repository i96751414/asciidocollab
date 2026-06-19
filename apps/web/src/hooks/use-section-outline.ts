'use client';

import { useEffect, useState } from 'react';
import { StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { outlineField } from '@/lib/codemirror/asciidoc-outline';
import { refreshHeadingLevelsEffect } from '@/lib/codemirror/asciidoc-heading-levels';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

const EMPTY_OUTLINE: SectionOutlineEntry[] = [];
const EMPTY_SCOPE: ReadonlyMap<string, string> = new Map();

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
}

/**
 * Returns the live section outline for a CodeMirror view, kept in sync with the editor's resolved
 * cross-document state (R11). It:
 *
 *  - subscribes to view updates (event-driven, no polling) so the outline tracks doc edits and the
 *    out-of-band {@link refreshHeadingLevelsEffect} that fires when the include structure or project
 *    main-file setting changes (FR-007a/FR-007b);
 *  - dispatches {@link refreshHeadingLevelsEffect} when the inherited offset or resolved scope
 *    changes, so the single authority `computeHeadingLevels` re-runs without a document edit.
 *
 * Effective-level logic is NOT duplicated here — it stays in `computeHeadingLevels`, which the
 * outline field derives from.
 *
 * @param view - The mounted editor view, or null before mount.
 * @param options - Live accessors for the resolved scope and inherited offset.
 * @returns The current section outline entries (empty when the view/field is absent).
 */
export function useSectionOutline(
  view: EditorView | null,
  options: UseSectionOutlineOptions = {},
): SectionOutlineEntry[] {
  const { getResolvedScope, getInheritedOffset } = options;
  const scopeVersion = options.scopeVersion ?? (getResolvedScope ? getResolvedScope() : EMPTY_SCOPE);
  const offsetVersion = options.offsetVersion ?? (getInheritedOffset ? getInheritedOffset() : 0);

  const [entries, setEntries] = useState<SectionOutlineEntry[]>(() => readOutline(view));

  // Install an updateListener once per view so the live outline is pushed into React state on any
  // view update (doc edit or refresh effect) — event-driven, never a timer (Issue 9). The resolved
  // scope itself is supplied by the editor's own `outlineResolvedScopeFacet` provider (installed at
  // build time in buildEditorExtensions), so the hook does not re-provide it. Guarded so a mock view
  // without reconfigure support degrades to a single read.
  useEffect(() => {
    if (!view) {
      setEntries(EMPTY_OUTLINE);
      return;
    }

    const updateListener = EditorView.updateListener.of((update) => {
      setEntries(readOutline(update.view));
    });

    try {
      view.dispatch({
        effects: StateEffect.appendConfig.of([updateListener]),
      });
    } catch {
      /* Mock/partial view without dispatch support — fall through to a single synchronous read. */
    }

    setEntries(readOutline(view));
  }, [view]);

  // When the inherited offset or resolved scope changes out-of-band (include structure / main-file
  // change), nudge the single authority `computeHeadingLevels` to re-run so the outline reflects new
  // effective levels, resolved titles, and inactive-branch marking without a document edit.
  useEffect(() => {
    if (!view) return;
    try {
      view.dispatch({ effects: refreshHeadingLevelsEffect.of() });
    } catch {
      /* Mock/partial view — refresh is a no-op; the synchronous read below still applies. */
    }
    setEntries(readOutline(view));
  }, [view, scopeVersion, offsetVersion]);

  return entries;
}
