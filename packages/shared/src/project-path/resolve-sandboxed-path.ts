/**
 * Single sandbox path-resolution rule (Constitution IX). Resolves an
 * `include::`/`image::`/attribute-substituted target, relative to the file that
 * references it, into a normalized project-relative path — rejecting traversal
 * (`..`), absolute paths, and remote/external URLs. Used by the web symbol
 * index, the render worker, and the domain move/rename/file-read use cases so
 * the security boundary is defined exactly once.
 */

const REMOTE_RE = /^[a-z][a-z0-9+.-]*:\/\//i; // scheme:// → remote
const DATA_URI_RE = /^data:/i;

/** Discriminated result of a sandboxed-path resolution. */
export type SandboxedPathResult =
  | {
      /** Resolution succeeded. */
      ok: true;
      /** Normalized, project-relative POSIX path. */
      path: string;
    }
  | {
      /** Resolution was rejected. */
      ok: false;
      /** Why the target was rejected. */
      reason: 'absolute' | 'remote' | 'traversal' | 'empty';
    };

/**
 * Resolve `target` (referenced from `fromPath`, a project-relative file path)
 * to a sandboxed project-relative path.
 *
 * @param fromPath - The project-relative path of the referencing file.
 * @param target - The raw reference target.
 * @returns A {@link SandboxedPathResult}.
 */
export function resolveSandboxedPath(fromPath: string, target: string): SandboxedPathResult {
  const trimmed = target.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (REMOTE_RE.test(trimmed) || DATA_URI_RE.test(trimmed)) return { ok: false, reason: 'remote' };
  if (trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed)) return { ok: false, reason: 'absolute' };

  const baseSegments = fromPath.split('/').slice(0, -1); // directory of the referencing file
  const resultSegments = [...baseSegments];

  for (const segment of trimmed.replaceAll('\\', '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (resultSegments.length === 0) return { ok: false, reason: 'traversal' }; // escaped the project root
      resultSegments.pop();
      continue;
    }
    resultSegments.push(segment);
  }

  return { ok: true, path: resultSegments.join('/') };
}
