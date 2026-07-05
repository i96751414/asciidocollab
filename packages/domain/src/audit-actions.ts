/**
 * @file Named audit action-type identifiers for events added by the audit-log
 * coverage feature (025). Centralized so new actions are not magic strings.
 * Existing inline action strings (e.g. 'project.created') are left in place.
 */

// Authentication & account events
export const AUDIT_AUTH_SIGNED_IN = 'auth.signed_in';
export const AUDIT_AUTH_SIGNED_OUT = 'auth.signed_out';
export const AUDIT_AUTH_REGISTERED = 'auth.registered';
export const AUDIT_AUTH_PASSWORD_CHANGED = 'auth.password_changed';
export const AUDIT_AUTH_PASSWORD_RESET = 'auth.password_reset';
export const AUDIT_AUTH_EMAIL_CHANGED = 'auth.email_changed';

// File & folder lifecycle events
export const AUDIT_FILE_CREATED = 'file.created';
export const AUDIT_FOLDER_CREATED = 'folder.created';
export const AUDIT_FILE_UPLOADED = 'file.uploaded';
export const AUDIT_FILE_MOVED = 'file.moved';
export const AUDIT_FILE_RENAMED = 'file.renamed';
export const AUDIT_SYMBOL_RENAMED = 'symbol.renamed';
export const AUDIT_PROJECT_CONTENT_REPLACED = 'project.content_replaced';

// Authorization events
export const AUDIT_AUTHZ_DENIED = 'authz.denied';
