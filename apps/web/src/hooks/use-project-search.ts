'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SearchMode, SearchQueryDto, SearchResultDto } from '@asciidocollab/shared';
import { searchProjectContent, ProjectSearchApiError } from '@/lib/api/project-search';

const DEBOUNCE_MS = 250;

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
  const abortReference = useRef<AbortController | null>(null);

  const setQuery = useCallback((patch: Partial<ProjectSearchQuery>) => {
    setQueryState((previous) => ({ ...previous, ...patch }));
  }, []);

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

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
      const dto: SearchQueryDto = {
        query: query.query,
        mode: query.mode,
        caseSensitive: query.caseSensitive,
        // Whole-word has no meaning in regex mode (use `\b` in the pattern).
        wholeWord: query.mode === 'regex' ? false : query.wholeWord,
      };
      try {
        const data = await searchProjectContent(projectId, dto, controller.signal);
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

  return { query, setQuery, result, status, error, refresh };
}
