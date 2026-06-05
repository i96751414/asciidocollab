/**
 * Client-side editor configuration.
 *
 * All tuneable values are read from NEXT_PUBLIC_* environment variables so
 * operators can override them without rebuilding the application.  Defaults
 * are chosen to be safe for typical self-hosted deployments.
 *
 * Server-side API configuration lives in apps/api/config/*.yaml.
 */

/** Milliseconds between the last keystroke and the auto-save PUT request. */
export const AUTOSAVE_DEBOUNCE_MS = Number(
  process.env.NEXT_PUBLIC_EDITOR_AUTOSAVE_DEBOUNCE_MS ?? 4000,
);

/** Milliseconds between external-change HEAD polls when the editor is open. */
export const EXTERNAL_CHANGE_POLL_INTERVAL_MS = Number(
  process.env.NEXT_PUBLIC_EDITOR_POLL_INTERVAL_MS ?? 30_000,
);

/** LocalStorage key prefix for offline draft content. */
export const OFFLINE_QUEUE_KEY_PREFIX = 'asciidocollab:editor-draft:';

/** Minimum allowed editor font size in pixels. */
export const FONT_SIZE_MIN = 8;

/** Maximum allowed editor font size in pixels. */
export const FONT_SIZE_MAX = 32;
