/** DTO representing a user's editor preferences, returned by the API. */
export interface EditorPreferencesDto {
  /** Font size in pixels. */
  fontSize: number;
  /** Editor colour theme identifier. */
  theme: 'default' | 'high-contrast';
}
