'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SearchMode, SearchQueryDto, SearchResultDto, ReplaceScope, FileReplaceSelectionDto } from '@asciidocollab/shared';
import { searchProjectContent, replaceProjectContent, ProjectSearchApiError } from '@/lib/api/project-search';

const DEBOUNCE_MS = 250;

/** Identifies a single match across the result set (file + its ordinal). */
function matchKey(fileNodeId: string, ordinal: number): string {
  return `${fileNodeId}:${ordinal}`;
}

/** What to replace: a single match, a whole file, or the whole project. */
export interface ReplaceTarget {
  /** How far the replace applies. */
  scope: ReplaceScope;
  /** Present for `file`/`match` scope. */
  fileNodeId?: string;
  /** Present for `match` scope. */
  ordinal?: number;
}

/** The search request state, editable field-by-field from the view. */
export interface ProjectSearchQuery {
  /** The literal text or regular-expression source. */
  query: string;
  /** Whether `query` is a literal or a regular expression. */
  mode: SearchMode;
  /** Case-sensitive when true. */
  caseSensitive: boolean;
  /** Whole-word only; inert in regex mode. */
  wholeWord: boolean;
}

const EMPTY_QUERY: ProjectSearchQuery = { query: '', mode: 'literal', caseSensitive: false, wholeWord: false };

/** Maps the editable query fields to the wire DTO (whole-word is inert in regex mode). */
function queryToDto(query: ProjectSearchQuery): SearchQueryDto {
  return {
    query: query.query,
    mode: query.mode,
    caseSensitive: query.caseSensitive,
    wholeWord: query.mode === 'regex' ? false : query.wholeWord,
  };
}

/** The lifecycle of the current search. */
export type ProjectSearchStatus = 'idle' | 'loading' | 'success' | 'error';

/** A user-facing error, with the API code (e.g. `INVALID_PATTERN`) for inline rendering. */
export interface ProjectSearchError {
  /** The API error code (e.g. `INVALID_PATTERN`). */
  code: string;
  /** The human-readable error message. */
  message: string;
}

/** The state and controls the Search tab consumes. */
export interface UseProjectSearchResult {
  /** The current query fields. */
  query: ProjectSearchQuery;
  /**
   * Merge a partial update into the query (re-runs the search, debounced).
   *
   * @param patch - The query fields to change.
   */
  setQuery: (patch: Partial<ProjectSearchQuery>) => void;
  /** The latest results, or null before the first successful search. */
  result: SearchResultDto | null;
  /** The search lifecycle status. */
  status: ProjectSearchStatus;
  /** The current error, or null. */
  error: ProjectSearchError | null;
  /** Re-run the current query immediately, for example after a replace resolves matches. */
  refresh: () => void;
  /** The replacement text. */
  replacement: string;
  /**
   * Set the replacement text.
   *
   * @param value - The new replacement text.
   */
  setReplacement: (value: string) => void;
  /**
   * Whether a specific match is excluded from replacement.
   *
   * @param fileNodeId - The match's file.
   * @param ordinal - The match's ordinal within that file.
   * @returns True when the match is excluded.
   */
  isExcluded: (fileNodeId: string, ordinal: number) => boolean;
  /**
   * Toggle a match's exclusion from replacement.
   *
   * @param fileNodeId - The match's file.
   * @param ordinal - The match's ordinal within that file.
   */
  toggleExcluded: (fileNodeId: string, ordinal: number) => void;
  /** The replace lifecycle status. */
  replaceStatus: 'idle' | 'replacing' | 'error';
  /** The current replace error, or null. */
  replaceError: ProjectSearchError | null;
  /** Total non-excluded matches in the current results (for the confirmation dialog). */
  includedMatchCount: number;
  /**
   * Apply a replace over the given target, then refresh the results.
   *
   * @param target - The scope (and optional file/ordinal) to replace.
   */
  replace: (target: ReplaceTarget) => Promise<void>;
}

/**
 * Drives the project-wide Search tab: debounced, cancelable queries against the
 * search route. Each new query aborts the previous request (`AbortController`);
 * an empty query is the idle state; an invalid regex surfaces as an inline
 * error carrying the `INVALID_PATTERN` code.
 */
export function useProjectSearch(projectId: string): UseProjectSearchResult {
  const [query, setQueryState] = useState<ProjectSearchQuery>(EMPTY_QUERY);
  const [result, setResult] = useState<SearchResultDto | null>(null);
  const [status, setStatus] = useState<ProjectSearchStatus>('idle');
  const [error, setError] = useState<ProjectSearchError | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [replacement, setReplacement] = useState('');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [replaceStatus, setReplaceStatus] = useState<'idle' | 'replacing' | 'error'>('idle');
  const [replaceError, setReplaceError] = useState<ProjectSearchError | null>(null);
  const abortReference = useRef<AbortController | null>(null);

  const setQuery = useCallback((patch: Partial<ProjectSearchQuery>) => {
    setQueryState((previous) => ({ ...previous, ...patch }));
  }, []);

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  const isExcluded = useCallback(
    (fileNodeId: string, ordinal: number) => excluded.has(matchKey(fileNodeId, ordinal)),
    [excluded],
  );

  const toggleExcluded = useCallback((fileNodeId: string, ordinal: number) => {
    setExcluded((previous) => {
      const next = new Set(previous);
      const key = matchKey(fileNodeId, ordinal);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const includedMatchCount = useMemo(() => {
    if (!result) return 0;
    return result.groups.reduce(
      (total, group) => total + group.matches.filter((match) => !excluded.has(matchKey(group.fileNodeId, match.ordinal))).length,
      0,
    );
  }, [result, excluded]);

  const replace = useCallback(
    async (target: ReplaceTarget) => {
      if (!result) return;
      const files: FileReplaceSelectionDto[] = [];
      for (const group of result.groups) {
        if (target.scope !== 'project' && group.fileNodeId !== target.fileNodeId) continue;
        const selections = group.matches
          .filter((match) =>
            target.scope === 'match'
              ? match.ordinal === target.ordinal
              : !excluded.has(matchKey(group.fileNodeId, match.ordinal)),
          )
          .map((match) => ({ ordinal: match.ordinal, expectedText: match.matchText }));
        if (selections.length > 0) files.push({ fileNodeId: group.fileNodeId, selections });
      }
      if (files.length === 0) return;

      setReplaceStatus('replacing');
      setReplaceError(null);
      try {
        await replaceProjectContent(projectId, { query: queryToDto(query), replacement, scope: target.scope, files });
        setReplaceStatus('idle');
        // Re-search so resolved matches disappear; drop stale exclusions.
        setExcluded(new Set());
        refresh();
      } catch (error_) {
        const apiError = error_ instanceof ProjectSearchApiError
          ? { code: error_.code, message: error_.message }
          : { code: 'REPLACE_ERROR', message: error_ instanceof Error ? error_.message : 'Replace failed' };
        setReplaceError(apiError);
        setReplaceStatus('error');
      }
    },
    [result, projectId, query, replacement, excluded, refresh],
  );

  useEffect(() => {
    // Abort any in-flight request when the query changes or the component unmounts.
    abortReference.current?.abort();

    if (query.query.length === 0) {
      setStatus('idle');
      setResult(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortReference.current = controller;
    setStatus('loading');

    const timer = setTimeout(async () => {
      try {
        const data = await searchProjectContent(projectId, queryToDto(query), controller.signal);
        if (controller.signal.aborted) return;
        setResult(data);
        setStatus('success');
        setError(null);
      } catch (error_) {
        if (controller.signal.aborted || (error_ instanceof DOMException && error_.name === 'AbortError')) return;
        const apiError = error_ instanceof ProjectSearchApiError
          ? { code: error_.code, message: error_.message }
          : { code: 'SEARCH_ERROR', message: error_ instanceof Error ? error_.message : 'Search failed' };
        setError(apiError);
        setStatus('error');
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, query.query, query.mode, query.caseSensitive, query.wholeWord, refreshNonce]);

  return {
    query,
    setQuery,
    result,
    status,
    error,
    refresh,
    replacement,
    setReplacement,
    isExcluded,
    toggleExcluded,
    replaceStatus,
    replaceError,
    includedMatchCount,
    replace,
  };
}
