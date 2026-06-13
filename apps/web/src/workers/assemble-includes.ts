import { resolveSandboxedPath } from '../lib/asciidoc/sandbox-path';
import { parseIncludeLevelOffset } from '../lib/asciidoc/extraction';

/**
 * Sandbox-confined AsciiDoc include assembler (US8/FR-068, Constitution IX).
 *
 * Pre-expands `include::target[]` directives into a single document before it reaches Asciidoctor,
 * so the preview can render the configured main document with its includes inlined. EVERY target is
 * routed through the shared {@link resolveSandboxedPath} boundary: parent-traversal (`..`), absolute,
 * remote (`http(s)://`), percent-encoded, and otherwise out-of-project targets are rejected and never
 * read — they are replaced with an Asciidoctor "Unresolved directive" marker instead. Cycles and
 * excessive depth are guarded. This is the only place the preview crosses file boundaries, so it must
 * never read a path the boundary did not bless.
 */

/** A directive that could not be safely assembled, with the reason it was rejected. */
export interface UnresolvedInclude {
  /** The project-relative path of the file containing the directive. */
  from: string;
  /** The raw include target. */
  target: string;
  /** Why it was not assembled: a sandbox rejection reason, or `not-found` / `cycle` / `depth`. */
  reason: string;
}

/** Result of assembling a document tree from a root file. */
export interface AssembleResult {
  /** The assembled document with in-sandbox includes inlined. */
  content: string;
  /** Every directive that was rejected or could not be resolved, in encounter order. */
  unresolved: UnresolvedInclude[];
}

// A whole-line include directive: optional leading whitespace, `include::target[attrs]`.
const INCLUDE_LINE_RE = /^[ \t]*include::([^[\n]+)\[([^\]\n]*)\]\s*$/;
const DEFAULT_MAX_DEPTH = 64;

/** Format a signed `:leveloffset:` value (`+2` / `-1`). */
function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/**
 * Assemble the document rooted at `rootPath`, inlining sandbox-approved includes.
 *
 * @param rootPath - The project-relative path of the root (main) file.
 * @param readFile - Returns a project-relative path's content, or null if unavailable.
 * @param options - Optional `maxDepth` (default 64) bounding include nesting.
 * @returns The assembled content and the list of unresolved/rejected directives.
 */
export function assembleIncludes(
  rootPath: string,
  readFile: (path: string) => string | null,
  options: { maxDepth?: number } = {},
): AssembleResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const unresolved: UnresolvedInclude[] = [];

  const marker = (from: string, target: string, reason: string): string => {
    unresolved.push({ from, target, reason });
    return `Unresolved directive in ${from} - include::${target}[]`;
  };

  const expand = (path: string, stack: readonly string[], depth: number): string => {
    const content = readFile(path);
    if (content === null) return '';
    const out: string[] = [];
    for (const line of content.split('\n')) {
      const match = INCLUDE_LINE_RE.exec(line);
      if (!match) {
        out.push(line);
        continue;
      }
      const target = match[1].trim();
      const resolved = resolveSandboxedPath(path, target);
      if (!resolved.ok) {
        out.push(marker(path, target, resolved.reason));
        continue;
      }
      if (stack.includes(resolved.path)) {
        out.push(marker(path, target, 'cycle'));
        continue;
      }
      if (depth + 1 > maxDepth) {
        out.push(marker(path, target, 'depth'));
        continue;
      }
      if (readFile(resolved.path) === null) {
        out.push(marker(path, target, 'not-found'));
        continue;
      }
      const child = expand(resolved.path, [...stack, resolved.path], depth + 1);
      const offset = parseIncludeLevelOffset(match[2]);
      if (offset === 0) {
        out.push(child);
      } else {
        out.push(`:leveloffset: ${signed(offset)}`, child, `:leveloffset: ${signed(-offset)}`);
      }
    }
    return out.join('\n');
  };

  if (readFile(rootPath) === null) {
    return { content: '', unresolved: [{ from: '', target: rootPath, reason: 'not-found' }] };
  }
  return { content: expand(rootPath, [rootPath], 0), unresolved };
}
