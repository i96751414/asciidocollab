/**
 * Computes the relative reference target that, written in `fromFile`, points at
 * `toFile` — the inverse of {@link resolveSandboxedPath}. Used by the domain
 * move/rename use cases to rewrite `include::`/`image::`/`xref:`
 * targets so they keep resolving after a referenced file moves. Both inputs are
 * normalized project-relative POSIX paths WITHOUT a leading slash (the same
 * convention `resolveSandboxedPath` consumes); the result is suitable to drop
 * straight back into a directive target.
 */

/** Strip any leading slashes so a `/docs/a.adoc` FilePath becomes the sandbox-relative `docs/a.adoc`. */
export function toProjectRelative(path: string): string {
  return path.replace(/^\/+/, '');
}

/**
 * Build the relative target from `fromFile` to `toFile`.
 *
 * @param fromFile - Project-relative path of the file that holds the reference.
 * @param toFile - Project-relative path of the referenced file.
 * @returns A relative POSIX target (e.g. `../shared/intro.adoc`, `intro.adoc`).
 *   When the two paths are identical the basename is returned (a self-reference
 *   keeps a usable, resolvable target rather than the empty string).
 */
export function relativeProjectPath(fromFile: string, toFile: string): string {
  const from = toProjectRelative(fromFile).split('/');
  const to = toProjectRelative(toFile).split('/');
  const fromDirectory = from.slice(0, -1); // directory segments of the referencing file

  let common = 0;
  while (common < fromDirectory.length && common < to.length - 1 && fromDirectory[common] === to[common]) {
    common += 1;
  }

  const ups = fromDirectory.length - common;
  const downSegments = to.slice(common);
  const segments = [...Array.from({ length: ups }, () => '..'), ...downSegments];
  // Identical paths collapse to nothing above; fall back to the basename so the
  // rewritten target still resolves to the file rather than to its directory.
  return segments.length > 0 ? segments.join('/') : (to.at(-1) ?? '');
}
