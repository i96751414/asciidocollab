export const INCLUDE_PLACEHOLDER_CLASS = 'adoc-include-placeholder';
export const INCLUDE_PLACEHOLDER_TARGET_ATTR = 'data-include-target';

/**
 * HTML-escapes the five characters that must be safe inside HTML attribute
 * values and text content.  Order matters: `&` must be escaped first so that
 * the replacement sequences themselves are never double-escaped.
 */
export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Returns an AsciiDoc passthrough block containing a single clickable `<div>`
 * placeholder that represents a hidden include.
 *
 * The `target` (e.g. `parts/chapter1.adoc`) is HTML-escaped so that any
 * special characters in file paths are safe both in the attribute value and in
 * the visible label.
 */
export function buildIncludePlaceholderBlock(target: string): string {
  const escaped = escapeHtml(target);
  return [
    '++++',
    `<div class="${INCLUDE_PLACEHOLDER_CLASS}" ${INCLUDE_PLACEHOLDER_TARGET_ATTR}="${escaped}" role="button" tabindex="0">included: ${escaped}</div>`,
    '++++',
    '',
  ].join('\n');
}
