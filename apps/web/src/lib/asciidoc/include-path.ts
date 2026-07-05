import { resolveSandboxedPath, type SandboxedPathResult } from './sandbox-path';
// `{ref}` expansion is the shared zero-dependency authority so the editor and server resolve targets
// identically; imported for use below AND re-exported so existing editor consumers keep importing it
// from this module.
import { substitutePathAttributes } from '@asciidocollab/asciidoc-core';
export { substitutePathAttributes } from '@asciidocollab/asciidoc-core';

/**
 * Centralized AsciiDoc include/image path logic for the in-browser editor — BOTH
 * directions in one place so resolution and authoring can never drift apart (the
 * divergence that previously let a dropped/typed path navigate yet fail to render
 * or lint):
 *  - RESOLUTION: turn a raw `include::`/`image::` target into a sandboxed project-
 *    relative path, applying `{attr}` substitution and (for images) `:imagesdir:`.
 *  - AUTHORING: turn a project-relative file path into the target to write, relative
 *    to the authoring file (and the image base dir), so it resolves back.
 *
 * NON-AUTHORITATIVE MIRROR of the domain rules in
 * `packages/domain/src/services/asciidoc-path.ts` (resolution) + the move/rename
 * relativizer; a server round-trip per keystroke is not viable. Keep them in sync.
 */

// A target naming its own scheme/root (URL, data URI, absolute path): `imagesdir` is never prepended.
const REMOTE_OR_ABSOLUTE_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/|data:|[/\\]|[A-Za-z]:[/\\])/i;

/** An empty attribute map, for resolution sites with no attribute context. */
export const NO_ATTRIBUTES: ReadonlyMap<string, string> = new Map();

// A synthetic file whose directory is the project root, used as the base for image resolution
// (images resolve relative to the project root + imagesdir, not the folder of the macro's file).
const PROJECT_ROOT = '_root_';

/** Strip trailing `/` characters in linear time (a `/\/+$/` regex is polynomial ReDoS). */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end--;
  return value.slice(0, end);
}

/**
 * The effective `:imagesdir:` (attribute-expanded, trimmed, trailing-slash-free),
 * or `''` when unset — document-relative, combined with the target by callers.
 *
 * @param attributes - Attribute name (lowercase) → value map.
 * @returns The image base directory, or an empty string.
 */
export function imagesDirectory(attributes: ReadonlyMap<string, string>): string {
  const raw = attributes.get('imagesdir');
  if (raw === undefined) return '';
  return stripTrailingSlashes(substitutePathAttributes(raw, attributes).trim());
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
 * the resolved location is `imagesdir + target`, taken relative to the document's
 * base directory — which in this project model is the PROJECT ROOT (not the folder of
 * the file the macro sits in; that is what distinguishes images from includes). There
 * is exactly one resolution: when `:imagesdir:` is defined it is prepended, otherwise
 * the target is used as-is. A remote/absolute target bypasses `imagesdir` (and is then
 * rejected by the sandbox).
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

/** Fold `.`/`..`/empty segments, clamping `..` at the project root. */
function normalizeSegments(segments: readonly string[]): string[] {
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out;
}

/**
 * Compute the `include::` target to *write* into `fromPath` so Asciidoctor — which
 * resolves directives relative to the including file's own directory — reads back
 * `targetPath`. The result uses `../` to climb out of shared ancestors as needed.
 *
 * Inverse of {@link resolveIncludeTarget} for a literal (attribute-free) target:
 * `resolveSandboxedPath(fromPath, relativeIncludePath(fromPath, t)) === t`. When
 * `fromPath` is null the project-relative `targetPath` is returned unchanged
 * (correct only when the authoring file sits at the project root).
 *
 * @param fromPath - Project-relative path of the file the directive is written into, or null.
 * @param targetPath - Project-relative path of the referenced file.
 * @returns The directive target relative to the authoring file's directory.
 */
export function relativeIncludePath(fromPath: string | null, targetPath: string): string {
  if (fromPath === null) return targetPath;
  const fromDirectory = fromPath.split('/').slice(0, -1); // directory segments of the authoring file
  const target = targetPath.split('/');
  let shared = 0;
  while (shared < fromDirectory.length && shared < target.length - 1 && fromDirectory[shared] === target[shared]) {
    shared += 1;
  }
  const ups = Array.from({ length: fromDirectory.length - shared }, () => '..');
  return [...ups, ...target.slice(shared)].join('/');
}

/**
 * Compute the `image::` target to *write* for `targetPath`, the inverse of
 * {@link resolveImageTarget}. Images resolve relative to the project root, so with no
 * `:imagesdir:` the target IS the project-relative path; when `imagesdir` is defined the
 * path is expressed relative to it (the prefix Asciidoctor prepends back on resolution).
 *
 * @param targetPath - Project-relative path of the image.
 * @param attributes - Attribute name (lowercase) → value map (supplies `imagesdir`).
 * @returns The image macro target.
 */
export function relativeImagePath(targetPath: string, attributes: ReadonlyMap<string, string>): string {
  const directory = imagesDirectory(attributes);
  if (!directory) return targetPath;
  const baseDirectory = normalizeSegments(directory.split('/'));
  // relativeIncludePath drops the last segment of its fromPath as the file name, so append a
  // throwaway segment to make `baseDirectory` the directory it relativizes against.
  return relativeIncludePath(baseDirectory.length > 0 ? `${baseDirectory.join('/')}/_` : '_', targetPath);
}
