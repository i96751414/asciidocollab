/**
 * Shared HTTP transport for the JSON API client.
 * CSRF protection is handled by SameSite=Strict cookies + server-side Origin header
 * validation. No manual CSRF tokens are needed.
 */

/** Base URL of the Fastify backend, configurable via NEXT_PUBLIC_API_URL. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Custom error class for API errors.
 */
export class ApiError extends Error {
  /** Constructs an ApiError with HTTP status, error code, human-readable message, and optional retry delay. */
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Performs a JSON request against the backend, attaching credentials and
 * throwing an {@link ApiError} for any non-ok response.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      // Only declare Content-Type when there is a body to describe.
      // Sending Content-Type: application/json on a bodyless POST causes
      // Fastify's JSON body parser to attempt to parse an empty body → 400.
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error?.code ?? 'UNKNOWN_ERROR',
      data.error?.message ?? 'An unexpected error occurred',
      data.error?.retryAfter,
    );
  }

  return data;
}

/** Query parameters for paginated list endpoints. */
export interface PaginationParameters {
  /** The 1-based page number to retrieve. */
  page?: number;
  /** Maximum number of items to return per page. */
  limit?: number;
  /** When true, include only archived items; when false, only active items. */
  archived?: boolean;
}

/** Generic wrapper returned by paginated list endpoints. */
export interface PaginatedResponse<T> {
  /** The array of items on the current page. */
  data: T[];
  /** Pagination metadata describing the current page position and total counts. */
  pagination: {
    /** The current page number. */
    page: number;
    /** The maximum number of items returned per page. */
    limit: number;
    /** Total number of items across all pages. */
    total: number;
    /** Total number of pages available. */
    totalPages: number;
  };
}
