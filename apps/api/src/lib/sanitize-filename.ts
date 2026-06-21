/** Strips characters that are illegal or dangerous inside a quoted `filename=` Content-Disposition token. */
export function sanitizeContentDispositionFilename(name: string): string {
  return name.replace(/[^\x20-\x7E]|["\\]/g, '');
}

/**
 * Builds a Content-Disposition `attachment` header value with both legacy and RFC 5987 filename params.
 *
 * `filename=` carries the ASCII-only fallback (for old clients that don't understand RFC 5987).
 * `filename*=UTF-8''...` carries the percent-encoded UTF-8 name (RFC 5987, for modern clients).
 *
 * @param name - The raw filename, possibly containing non-ASCII characters.
 * @param asciiFallback - An ASCII-only fallback; must not contain `"` or `\`. Typically produced
 *   by `sanitizeContentDispositionFilename(name) || 'file'`.
 */
export function buildAttachmentDisposition(name: string, asciiFallback: string): string {
  // encodeURIComponent encodes everything except A-Za-z0-9 - _ . ! ~ * ' ( )
  // RFC 5987 attr-char excludes * ' ( ) so we additionally encode those.
  const encoded = encodeURIComponent(name)
    .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
