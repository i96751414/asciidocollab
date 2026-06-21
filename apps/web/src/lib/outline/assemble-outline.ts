import { assembleIncludes, type UnresolvedInclude } from '@/workers/assemble-includes';
import { computeHeadingLevels } from '@/lib/codemirror/asciidoc-effective-levels';
import { ConditionalRegionStack } from '@/lib/asciidoc/conditional-regions';
import { substitutePathAttributes } from '@/lib/asciidoc/include-path';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

/** Effective scope after fallback resolution. */
export type ResolvedScope = 'full' | 'current';

/** Result of assembleOutline. */
export interface AssembledOutline {
  /** Provenance-tagged entries in assembled document order. */
  entries: SectionOutlineEntry[];
  /** The effective scope after fallback resolution. */
  scope: ResolvedScope;
  /** Unresolved includes passed through from assembleIncludes (graceful degradation, FR-014). */
  unresolved: UnresolvedInclude[];
  /** Main document used; null when no main document (current-file fallback). */
  rootFileId: string | null;
}

/** Input options for {@link assembleOutline}. */
export interface AssembleOutlineInput {
  /** Main document path; null ⇒ current-file fallback (FR-005). */
  rootPath: string | null;
  /** Path of the open file. */
  openFilePath: string;
  /** File node id of the open file. */
  openFileId: string;
  /**
   * Returns file content by project-relative path, or null if unavailable.
   *
   * @param path - Project-relative path of the file to read.
   */
  readFile: (path: string) => string | null;
  /**
   * Returns the file node id for a project-relative path.
   *
   * @param path - Project-relative path to resolve to a file node id.
   */
  fileIdForPath: (path: string) => string;
  /** Resolved attribute scope for `{attr}` substitution in titles. Defaults to empty. */
  resolvedScope?: ReadonlyMap<string, string>;
  /** User scope preference ('full' or 'current'). */
  scopePreference: 'full' | 'current';
}

const EMPTY_SCOPE: ReadonlyMap<string, string> = new Map();
const HEADING_PREFIX_RE = /^={1,6}\s+/;
// AsciiDoc attribute-definition lines: `:name: value` (set) and `:name!:` (unset). Matched per line
// while scanning so `{attr}` titles resolve against attributes defined earlier in the (assembled)
// document — AsciiDoc's define-before-use, document-order semantics.
const ATTR_SET_RE = /^:([A-Za-z0-9][\w-]*):[ \t]*(.*?)[ \t]*$/;
const ATTR_UNSET_RE = /^:([A-Za-z0-9][\w-]*)!:[ \t]*$/;
// Verbatim/comment delimited-block fences whose bodies are NOT subject to attribute substitution:
// listing (`----`), literal (`....`), passthrough (`++++`), and comment (`////`). A `:name:` line
// inside one of these is literal text, not an attribute definition (mirrors `verbatimRanges` in
// lib/asciidoc/extraction.ts). Capture group 1 is the delimiter token for length-sensitive closing.
const VERBATIM_FENCE_RE = /^(-{4,}|\.{4,}|\+{4,}|\/{4,})[ \t]*$/;

/** Apply one attribute-definition line to a mutable scope (sets the value, or removes it on unset). */
function applyAttributeLine(line: string, attributes: Map<string, string>): void {
  const unset = ATTR_UNSET_RE.exec(line);
  if (unset) {
    attributes.delete(unset[1].toLowerCase());
    return;
  }
  const set = ATTR_SET_RE.exec(line);
  if (set) attributes.set(set[1].toLowerCase(), set[2]);
}

/** Determines, for each 1-based line of documentText, whether it is inside an inactive conditional. */
function computeInactiveLines(documentText: string, scope: ReadonlyMap<string, string>): boolean[] {
  const lines = documentText.split('\n');
  const inactive: boolean[] = Array.from({ length: lines.length + 1 }, () => false);
  const stack = new ConditionalRegionStack();
  for (const [index, line] of lines.entries()) {
    stack.applyLine(line, scope);
    inactive[index + 1] = !stack.isActive();
  }
  return inactive;
}

/** Extract headings from a plain text string (no CM6 state), returning provenance-tagged entries. */
function extractHeadingsFromText(
  documentText: string,
  scope: ReadonlyMap<string, string>,
  inheritedOffset: number,
  getProvenance: (lineNumber: number) => { sourceFileId: string; sourcePath: string; sourceLine: number; isOpenFile: boolean },
): SectionOutlineEntry[] {
  const entries: SectionOutlineEntry[] = [];
  const lines = documentText.split('\n');
  const inactiveLines = computeInactiveLines(documentText, scope);
  // Index headings by 1-based line so each title can resolve against the attribute scope accumulated
  // up to that point as we walk the document in order.
  const headingByLine = new Map<number, ReturnType<typeof computeHeadingLevels>[number]>();
  for (const info of computeHeadingLevels(documentText, inheritedOffset)) headingByLine.set(info.line, info);
  // Working attribute scope, seeded with the inherited scope and extended in document order.
  const attributes = new Map(scope);
  // Tracks the delimiter token of the currently-open verbatim/comment block, or null when outside one.
  let openVerbatimDelimiter: string | null = null;
  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const active = !inactiveLines[lineNumber];
    // Maintain verbatim-block state so attribute definitions inside listing/literal/passthrough/
    // comment blocks (and `//` line comments) are treated as literal text, not real definitions.
    const fence = VERBATIM_FENCE_RE.exec(rawLine);
    const insideVerbatim = openVerbatimDelimiter !== null;
    if (insideVerbatim) {
      if (fence && fence[1] === openVerbatimDelimiter) openVerbatimDelimiter = null;
    } else if (fence) {
      openVerbatimDelimiter = fence[1];
    }
    const isVerbatim = insideVerbatim || fence !== null;
    const info = headingByLine.get(lineNumber);
    if (info && active && !info.beyondMax && !info.discrete && info.effectiveLevel >= 0) {
      const prefixMatch = rawLine.match(HEADING_PREFIX_RE);
      const rawTitle = prefixMatch ? rawLine.slice(prefixMatch[0].length) : rawLine;
      const title = substitutePathAttributes(rawTitle, attributes).trim();
      const provenance = getProvenance(info.line);
      entries.push({
        level: info.effectiveLevel,
        title,
        line: info.line,
        from: info.from,
        ...provenance,
      });
    }
    // Accumulate attribute definitions from active, non-verbatim, non-comment lines only (an inactive
    // conditional branch's definitions don't apply, and a `:name:` inside a verbatim/comment block or
    // a `//` line comment is literal text), so later `{attr}` titles resolve to the value in effect.
    if (active && !isVerbatim && !rawLine.startsWith('//')) applyAttributeLine(rawLine, attributes);
  }
  return entries;
}

/**
 * Assemble the full-document or current-file outline, with provenance tags on each entry.
 *
 * Resolves the effective scope per data-model §2:
 *  - scopePreference='current' → always current-file
 *  - scopePreference='full', rootPath null → current-file fallback (FR-005)
 *  - scopePreference='full', open file not reachable from root → current-file fallback (FR-006)
 *  - scopePreference='full', open file reachable → full assembled outline.
 */
export function assembleOutline(input: AssembleOutlineInput): AssembledOutline {
  const { rootPath, openFilePath, openFileId, readFile, fileIdForPath, scopePreference } = input;
  const scope = input.resolvedScope ?? EMPTY_SCOPE;

  // Current-file scope: extract headings from the open file only.
  const currentFileOutline = (): AssembledOutline => {
    const content = readFile(openFilePath);
    const entries = content === null
      ? []
      : extractHeadingsFromText(content, scope, 0, (line) => ({
          sourceFileId: openFileId,
          sourcePath: openFilePath,
          sourceLine: line,
          isOpenFile: true,
        }));
    return { entries, scope: 'current', unresolved: [], rootFileId: null };
  };

  // Forced current scope.
  if (scopePreference === 'current') return currentFileOutline();

  // Full scope requires a root path.
  if (rootPath === null) return currentFileOutline();

  // Assemble the full document with a source map to track provenance.
  const { content, unresolved, sourceMap } = assembleIncludes(rootPath, readFile, { withSourceMap: true });
  const lineToSource = sourceMap?.lineToSource ?? [];

  // Check if the open file is reachable (any source map entry points to it).
  const isReachable = lineToSource.some((sourceEntry) => sourceEntry.path === openFilePath);
  if (!isReachable) return currentFileOutline();

  // Full scope: extract headings over the assembled text with provenance from the source map.
  const rootFileId = fileIdForPath(rootPath);
  const entries = extractHeadingsFromText(content, scope, 0, (assembledLine) => {
    const entry = lineToSource[assembledLine - 1];
    if (entry === undefined) {
      return { sourceFileId: openFileId, sourcePath: openFilePath, sourceLine: assembledLine, isOpenFile: true };
    }
    const sourceFileId = fileIdForPath(entry.path);
    return {
      sourceFileId,
      sourcePath: entry.path,
      sourceLine: entry.sourceLine,
      isOpenFile: sourceFileId === openFileId,
    };
  });

  return { entries, scope: 'full', unresolved, rootFileId };
}
