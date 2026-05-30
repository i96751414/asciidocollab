/**
 * Returns true for same-origin paths, rejecting absolute URLs and protocol-relative URLs.
 *
 * @param path - The redirect target to validate.
 * @returns True when the path starts with `/` but not `//`.
 */
export function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}
