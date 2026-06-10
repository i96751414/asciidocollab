/** DTO representing a user's editor preferences, returned by the API. */
export interface EditorPreferencesDto {
  /** Font size in pixels. */
  fontSize: number;
  /** Editor colour theme identifier. */
  theme: 'default' | 'high-contrast' | 'dracula' | 'tomorrow' | 'espresso';
  /** When true, the preview panel scrolls to track the editor scroll position. */
  scrollSyncEnabled: boolean;
  /** When true, the editor wraps long lines. Defaults to true. */
  softWrap?: boolean;
  /** Preview rendering style token. Defaults to 'asciidocollab'. */
  previewStyle?: 'asciidocollab' | 'asciidoctor';
}
