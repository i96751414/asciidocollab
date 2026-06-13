/**
 * Client-side sandbox path-resolution guard (Constitution IX). Resolves an
 * `include::`/`image::` target, relative to the referencing file, into a
 * normalized project-relative path — rejecting traversal (`..`), absolute paths,
 * and remote/external URLs. Used by the editor's client-side preview assembly and
 * symbol index so the browser never follows an include outside the project.
 *
 * NON-AUTHORITATIVE: this is defense-in-depth for the in-browser editor. The
 * authoritative boundary is the domain's `resolveSandboxedPath`
 * (`@asciidocollab/domain`), enforced server-side wherever project content is
 * read or written. Keep the two implementations in sync.
 */

const REMOTE_RE = /^[a-z][a-z0-9+.-]*:\/\//i; // scheme:// → remote
const DATA_URI_RE = /^data:/i;
const RESIDUAL_ESCAPE_RE = /%[0-9a-fA-F]{2}/; // a percent-escape that survived one decode (double-encoded)

/**
 * Whether `value` contains a NUL or other control character (code point < 0x20 or 0x7f).
 * Such characters never belong in a project path and are a classic poison-null-byte vector.
 *
 * @param value - The string to inspect.
 * @returns True if any control character is present.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7F) return true;
  }
  return false;
}

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
      reason: 'absolute' | 'remote' | 'traversal' | 'empty' | 'invalid';
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
  // Decode percent-encoding first so `%2e%2e` (`..`) and `%2f` (`/`) cannot smuggle
  // traversal/scheme past the literal checks below — this is the single security
  // boundary, so it must be evaluated on the decoded form.
  let decoded: string;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    decoded = target; // malformed escape — fall back to the raw form (still checked below)
  }
  const trimmed = decoded.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  // NUL/control chars (poison-null-byte) and a percent-escape that survived the single
  // decode (double-encoding, e.g. `%252e` → `%2e`) are rejected outright: the former can
  // truncate a downstream suffix check, the latter re-expands to `..`/`/` if any later
  // layer decodes again. Either defeats the literal traversal/scheme checks below.
  if (hasControlCharacter(trimmed) || RESIDUAL_ESCAPE_RE.test(trimmed)) return { ok: false, reason: 'invalid' };
  if (REMOTE_RE.test(trimmed) || DATA_URI_RE.test(trimmed)) return { ok: false, reason: 'remote' };
  // A leading backslash is a Windows UNC (`\\host\share`) or root-absolute path; treat it
  // as absolute before the `\`→`/` normalization below rewrites it into ordinary segments.
  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return { ok: false, reason: 'absolute' };
  }

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

  // An empty result means the target resolved to the project root directory itself,
  // not a file — reject it rather than hand back a directory path as if it were one.
  if (resultSegments.length === 0) return { ok: false, reason: 'traversal' };
  return { ok: true, path: resultSegments.join('/') };
}
