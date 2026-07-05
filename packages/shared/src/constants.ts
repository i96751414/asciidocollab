/** Default port the apps/api internal collaboration server binds to. */
export const COLLAB_INTERNAL_PORT_DEFAULT = 4001;

/**
 * Paths of the internal collaboration auth endpoints (apps/api internal server). Shared so the
 * collab auth-hook URL builder and the API route registration reference one source and cannot drift.
 */
export const COLLAB_AUTH_DOCUMENT_PATH = '/internal/collab/auth/document';
export const COLLAB_AUTH_PRESENCE_PATH = '/internal/collab/auth/presence';

/**
 * Path of the internal content-changed notify endpoint (apps/api internal server). The collab server
 * POSTs here on a debounced live edit so the API can broadcast a content-changed event to the
 * project's SSE subscribers. Shared so the collab notifier and the API route reference one source.
 */
export const COLLAB_CONTENT_CHANGED_PATH = '/internal/collab/content-changed';
