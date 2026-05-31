/** Result item returned by the user search endpoint. */
export interface UserSearchResultDto {
  /** Unique user identifier. */
  userId: string;
  /** User's display name. */
  displayName: string;
  /** User's email address. */
  email: string;
}
