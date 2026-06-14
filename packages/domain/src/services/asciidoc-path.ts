import { resolveSandboxedPath, type SandboxedPathResult } from '../value-objects/files/sandboxed-path';

/**
 * Centralized AsciiDoc include/image target resolution (Constitution IX).
 *
 * This is the ONE place that turns a raw `include::`/`image::` macro target into a
 * sandboxed project-relative path. Every resolver — the editor symbol index, the
 * preview assembler, Ctrl+click navigation, and the move/rename rewrite — must go
 * through here so the resolution rules cannot drift between sites (the divergence
 * that previously let a path resolve for navigation but not for diagnostics).
 *
 * Two AsciiDoc rules are applied before the {@link resolveSandboxedPath} security
 * boundary:
 *  1. Attribute substitution — `{name}` references in the target are replaced with
 *     the attribute's value (e.g. `include::{partsdir}/intro.adoc[]`). Names are
 *     case-insensitive (Asciidoctor downcases them); unknown references are left
 *     intact so the target simply fails to resolve rather than silently changing.
 *  2. `imagesdir` — `image::` targets are resolved relative to the `:imagesdir:`
 *     attribute (when set), exactly as Asciidoctor does; `include::` ignores it.
 *
 * NON-AUTHORITATIVE MIRROR: `apps/web/src/lib/asciidoc/include-path.ts` re-implements
 * these same rules for the in-browser editor (a server round-trip per keystroke is
 * not viable). Keep the two in sync.
 */

const ATTR_REF_RE = /\{([A-Za-z0-9][\w-]*)\}/g;
// A target that names its own scheme/root: a URL, data URI, or absolute path. `imagesdir` is
// never prepended to these (Asciidoctor leaves them as-is; the sandbox boundary then rejects them).
const REMOTE_OR_ABSOLUTE_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/|data:|[/\\]|[A-Za-z]:[/\\])/i;
// A synthetic file whose directory is the project root, used as the base for image resolution
// (images resolve relative to the project root + imagesdir, not the folder of the macro's file).
const PROJECT_ROOT = '_root_';

/**
 * Replace `{name}` attribute references in a macro target with their values,
 * resolving nested references up to `maxDepth` passes (a self-referential value
 * therefore cannot loop forever). Unknown references are left verbatim.
 *
 * @param target - The raw macro target.
 * @param attributes - Attribute name (lowercase) → value map.
 * @param maxDepth - Maximum expansion passes (default 10).
 * @returns The target with all known attribute references expanded.
 */
export function substitutePathAttributes(
  target: string,
  attributes: ReadonlyMap<string, string>,
  maxDepth = 10,
): string {
  let result = target;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    let changed = false;
    result = result.replaceAll(ATTR_REF_RE, (whole, name: string) => {
      const value = attributes.get(name.toLowerCase());
      if (value === undefined) return whole;
      changed = true;
      return value;
    });
    if (!changed) break;
  }
  return result;
}

/**
 * The effective `:imagesdir:` (attribute-expanded, trimmed, trailing-slash-free),
 * or `''` when unset. The returned value is still document-relative — it is
 * combined with the target and resolved through the sandbox by the callers.
 *
 * @param attributes - Attribute name (lowercase) → value map.
 * @returns The image base directory, or an empty string.
 */
export function imagesDirectory(attributes: ReadonlyMap<string, string>): string {
  const raw = attributes.get('imagesdir');
  if (raw === undefined) return '';
  return substitutePathAttributes(raw, attributes).trim().replace(/\/+$/, '');
}

/**
 * Resolve an `include::` target relative to the including file, after attribute
 * substitution, to a sandboxed project-relative path.
 *
 * @param fromPath - Project-relative path of the including file.
 * @param rawTarget - The raw include target (may contain `{attr}` references).
 * @param attributes - Attribute name (lowercase) → value map.
 * @returns The sandboxed resolution result.
 */
export function resolveIncludeTarget(
  fromPath: string,
  rawTarget: string,
  attributes: ReadonlyMap<string, string>,
): SandboxedPathResult {
  return resolveSandboxedPath(fromPath, substitutePathAttributes(rawTarget, attributes));
}

/**
 * Resolve an `image::`/`image:` target to a sandboxed project-relative path. Per
 * Asciidoctor (https://docs.asciidoctor.org/asciidoc/latest/macros/images-directory/)
 * the resolved location is `imagesdir + target`, relative to the document base
 * directory — the PROJECT ROOT in this model (not the folder of the macro's file; that
 * distinguishes images from includes). Exactly one resolution: `:imagesdir:` prepended
 * when defined, target as-is otherwise. Remote/absolute targets bypass `imagesdir`.
 *
 * @param rawTarget - The raw image target (may contain `{attr}` references).
 * @param attributes - Attribute name (lowercase) → value map (supplies `imagesdir`).
 * @returns The sandboxed resolution result.
 */
export function resolveImageTarget(
  rawTarget: string,
  attributes: ReadonlyMap<string, string>,
): SandboxedPathResult {
  const target = substitutePathAttributes(rawTarget, attributes);
  if (REMOTE_OR_ABSOLUTE_RE.test(target)) return resolveSandboxedPath(PROJECT_ROOT, target);
  const directory = imagesDirectory(attributes);
  return resolveSandboxedPath(PROJECT_ROOT, directory ? `${directory}/${target}` : target);
}
