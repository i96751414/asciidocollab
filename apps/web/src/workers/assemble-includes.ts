import { resolveSandboxedPath } from '../lib/asciidoc/sandbox-path';
import { buildIncludePlaceholderBlock } from '../lib/asciidoc/include-placeholder';
import {
  assembleIncludes as assembleIncludesCore,
  type AssembleIncludesOptions,
  type AssembleIncludesResult,
  type AssembledIncludeRejection,
  type AssembledSourceMap,
  type AssembledSourceMapEntry,
  type ProjectFileReader,
} from '@asciidocollab/asciidoc-core';

/**
 * App-side thin wrapper over the shared, environment-agnostic include-assembly primitive
 * (`@asciidocollab/asciidoc-core`). It supplies the two seams the primitive leaves injected: the
 * client-side sandbox path boundary (`resolveSandboxedPath`, Constitution IX) and the HTML hidden-include
 * placeholder builder. All include semantics — tag/line/leveloffset filters, conditional include-gating,
 * cycle and fan-out guards — live in the shared primitive so the HTML preview and any other rendering
 * path stay on a single source of truth and can never drift.
 *
 * The HTML preview is the only place the browser crosses file boundaries, so every (user-controlled)
 * target is routed through {@link resolveSandboxedPath} inside the primitive; rejected targets are never
 * read and surface as an "Unresolved directive" marker (or a placeholder block in hide mode).
 */

/** A directive that could not be safely assembled, with the reason it was rejected. */
export type UnresolvedInclude = AssembledIncludeRejection;

/** One entry in the assembled-line → source-file provenance map. */
export type SourceMapEntry = AssembledSourceMapEntry;

/** Parallel array to the assembled content: entry `i` gives the origin of assembled line `i+1`. */
export type IncludeSourceMap = AssembledSourceMap;

/** Result of assembling a document tree from a root file. */
export type AssembleResult = AssembleIncludesResult;

/**
 * Assemble the document rooted at `rootPath`, inlining sandbox-approved includes, using the app's
 * client-side sandbox boundary and HTML placeholder policy. See the shared primitive for the full
 * option semantics.
 *
 * @param rootPath - The project-relative path of the root (main) file.
 * @param readFile - Returns a project-relative path's content, or null if unavailable.
 * @param options - Assembly bounds and attribute seeding (see {@link AssembleIncludesOptions}).
 * @returns The assembled content and the list of unresolved/rejected directives.
 */
export function assembleIncludes(
  rootPath: string,
  readFile: ProjectFileReader,
  options: AssembleIncludesOptions = {},
): AssembleResult {
  return assembleIncludesCore(
    rootPath,
    { readFile, resolveSandboxedPath, buildPlaceholder: buildIncludePlaceholderBlock },
    options,
  );
}
