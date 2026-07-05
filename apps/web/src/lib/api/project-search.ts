import type { SearchQueryDto, SearchResultDto, ReplaceRequestDto, ReplaceResultDto } from '@asciidocollab/shared';
import { API_BASE_URL } from '@/lib/api/file-content';

/** An error from the search/replace API, carrying the HTTP status and error code. */
export class ProjectSearchApiError extends Error {
  /** Creates the error from the HTTP status, the API error code, and the message. */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectSearchApiError';
  }
}

function toApiError(response: Response, body: { error?: { message?: string; code?: string } }, fallback: string): ProjectSearchApiError {
  return new ProjectSearchApiError(
    response.status,
    body?.error?.code ?? 'SEARCH_ERROR',
    body?.error?.message ?? `${fallback}: ${response.status}`,
  );
}

/**
 * Runs a project-wide search via `POST /projects/:projectId/search`. Requires
 * project membership (enforced server-side). An invalid regex surfaces as a
 * thrown {@link ProjectSearchApiError} with code `INVALID_PATTERN`, which the
 * caller renders inline.
 *
 * @param projectId - The project to search.
 * @param query - The find query (literal or regex, with case/whole-word flags).
 * @param signal - Abort signal so a superseded query is cancelled.
 */
export async function searchProjectContent(
  projectId: string,
  query: SearchQueryDto,
  signal?: AbortSignal,
): Promise<SearchResultDto> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/search`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw toApiError(response, await response.json().catch(() => ({})), 'Search failed');
  }
  const parsed: { data: SearchResultDto } = await response.json();
  return parsed.data;
}

/**
 * Applies a reviewed project-wide replace via `POST /projects/:projectId/replace`.
 * Requires editor/owner (enforced server-side). An invalid regex or replacement
 * template surfaces as a thrown {@link ProjectSearchApiError} with code
 * `INVALID_PATTERN` / `INVALID_REPLACEMENT`.
 *
 * @param projectId - The project to replace within.
 * @param request - The query, replacement, scope, and per-file selections.
 */
export async function replaceProjectContent(projectId: string, request: ReplaceRequestDto): Promise<ReplaceResultDto> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/replace`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw toApiError(response, await response.json().catch(() => ({})), 'Replace failed');
  }
  const parsed: { data: ReplaceResultDto } = await response.json();
  return parsed.data;
}
