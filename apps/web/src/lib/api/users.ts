/**
 * User-directory API client (user search).
 */
import { apiRequest } from '@/lib/api/transport';

/** Represents a user returned from the user search endpoint. */
export interface UserSearchResult {
  /** Unique identifier of the user. */
  userId: string;
  /** Display name of the user. */
  displayName: string;
  /** Email address of the user. */
  email: string;
}

export const usersApi = {
  async search(
    query: string,
    excludeProjectId?: string,
  ): Promise<{ /** Wrapper object containing the search results. */
  data: { /** List of users matching the query. */
  users: UserSearchResult[] } }> {
    const parameters = new URLSearchParams({ q: query });
    if (excludeProjectId) parameters.set('excludeProjectId', excludeProjectId);
    return apiRequest(`/api/users/search?${parameters.toString()}`);
  },
};
