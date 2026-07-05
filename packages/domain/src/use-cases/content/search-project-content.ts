import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { FileNode } from '../../entities/file-node';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { CollaborativeContentReader } from '../../ports/storage/collaborative-content-reader';
import { RegexEngine, MatchBudget, MatchSpan, CompiledMatcher } from '../../ports/text/regex-engine';
import { Logger } from '../../ports/observability/logger';
import { isSearchableTextFile } from '../../value-objects/files/searchable-text-file';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { stripLeadingSlash } from '../file-tree/reference-rewrite';
import { computeMatches, SearchQuery } from './text-match';

// Domain-owned result contracts. Defined here beside their producer (mirrors
// `ReferenceUsage` in find-references), NOT in `@asciidocollab/shared`; the
// search route maps these to the `*.dto.ts` wire shapes.

export type { SearchQuery, SearchMode } from './text-match';

/** One match within a file, located for both display and navigation. */
export interface SearchMatch {
  /** 0-based index of this match within its file (identity for replace). */
  readonly ordinal: number;
  /** 1-based line of the match start. */
  readonly line: number;
  /** 1-based column of the match start. */
  readonly column: number;
  /** Char offset of the match start at scan time (navigation only). */
  readonly from: number;
  /** Char offset of the match end at scan time. */
  readonly to: number;
  /** The match's whole line, for a context snippet. */
  readonly lineText: string;
  /** The exact matched substring (the `expectedText` a replace selection confirms). */
  readonly matchText: string;
  /** Capture groups (index 0 = whole match; null = group absent), for a client-side `$n` preview. */
  readonly groups: ReadonlyArray<string | null>;
  /** Named capture groups, when the pattern defines any (for a `${name}` preview). */
  readonly named?: Readonly<Record<string, string | null>>;
}

/** All returned matches for one file. */
export interface FileMatchGroup {
  /** The file node containing the matches. */
  readonly fileNodeId: FileNodeId;
  /** Project-relative path, no leading slash. */
  readonly path: string;
  /** Total matches in this file (may exceed `matches.length` when the result is capped). */
  readonly matchCount: number;
  /** The returned matches, in document order. */
  readonly matches: SearchMatch[];
}

/** The outcome of a project-wide search. */
export interface SearchResult {
  /** File groups, ordered by path. */
  readonly groups: FileMatchGroup[];
  /** TRUE total across the project. */
  readonly totalMatches: number;
  /** Matches actually included (<= `maxMatchesReturned`). */
  readonly returnedMatches: number;
  /** True when `returnedMatches < totalMatches`. */
  readonly capped: boolean;
  /** Files excluded by size/binary detection (reported, never silent). */
  readonly skippedFiles: number;
}

/** Config-driven budgets bounding a single search (never hardcoded). */
export interface SearchLimits {
  /** Cap on matches returned to the client (the true total is still reported). */
  readonly maxMatchesReturned: number;
  /** Per-file match-evaluation time budget in milliseconds. */
  readonly perFileTimeBudgetMs: number;
  /** Files whose content exceeds this many bytes are skipped and reported. */
  readonly maxFileBytes: number;
}

/** Input to the project-wide search use case. */
export interface SearchProjectContentInput {
  /** The find query (literal or regex). */
  readonly query: SearchQuery;
  /** The budgets that bound this search. */
  readonly limits: SearchLimits;
}

/** Bytes of a file sampled for the binary/text sniff. */
const TEXT_SNIFF_BYTES = 8192;

/** Sentinel distinguishing "excluded (binary/oversize)" from "no content". */
const SKIPPED = Symbol('skipped');

/**
 * Per-file hard cap on materialised spans — a memory safety net far above any
 * realistic per-file match count (`maxFileBytes` already bounds file size). A
 * file that somehow exceeds it has its count reported as at-least-this, never
 * unbounded.
 */
const PER_FILE_MATCH_LIMIT = 100_000;

/** Precomputed 0-based line-start offsets for fast offset → line/column mapping. */
function lineStarts(content: string): number[] {
  const starts = [0];
  let index = content.indexOf('\n');
  while (index !== -1) {
    starts.push(index + 1);
    index = content.indexOf('\n', index + 1);
  }
  return starts;
}

/** Largest index `i` with `starts[i] <= offset` (binary search). */
function lineIndexAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Literal-mode spans (no engine needed); a literal query never fails to compute. */
function literalSpans(content: string, input: SearchProjectContentInput, budget: MatchBudget): MatchSpan[] {
  const matched = computeMatches(content, input.query, undefined, budget);
  return matched.success ? matched.value : [];
}

/** Normalizes a named-group record's `undefined` values to `null` for the wire/DTO. */
function mapNamed(named: Readonly<Record<string, string | undefined>>): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(named)) result[key] = value ?? null;
  return result;
}

function lineTextAt(content: string, starts: number[], lineIndex: number): string {
  const start = starts[lineIndex];
  const end = lineIndex + 1 < starts.length ? starts[lineIndex + 1] - 1 : content.length;
  // Trim a trailing CR from a CRLF line.
  const raw = content.slice(start, end);
  return raw.endsWith('\r') ? raw.slice(0, -1) : raw;
}

/**
 * Project-wide search across every text-decodable file. RBAC is enforced here
 * (Constitution: authorization in use cases): only a project member may search.
 * Content is read live-aware — the live Yjs text for an open file, else the
 * file-store projection — so results reflect unsaved edits. A regex query runs
 * on the injected linear-time engine; an invalid pattern is rejected before any
 * file is scanned.
 */
export class SearchProjectContentUseCase {
  /** Initializes the use case with the repositories, file store, and regex engine it needs. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
    private readonly regexEngine: RegexEngine,
    private readonly documentRepo?: Pick<DocumentRepository, 'findByFileNodeId'>,
    private readonly collaborativeContentReader?: CollaborativeContentReader,
    private readonly logger?: Logger,
  ) {}

  /**
   * Searches every text-decodable file in the project.
   *
   * @param actorId - The user requesting the search (must be a project member).
   * @param projectId - The project to search.
   * @param input - The query and the config-driven budgets that bound the scan.
   * @returns The grouped results with true/returned totals, or a
   *   `PermissionDeniedError` (non-member) / `ValidationError` (invalid regex).
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    input: SearchProjectContentInput,
  ): Promise<Result<SearchResult, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    // Compile a regex ONCE — up front, both to fail fast on an invalid pattern (so an empty project
    // still yields a clean rejection) and to reuse the one compiled matcher across every file rather
    // than recompiling per file. Literal mode needs no engine.
    let matcher: CompiledMatcher | null = null;
    if (input.query.mode === 'regex') {
      const compiled = this.regexEngine.compile(input.query.text, {
        caseSensitive: input.query.caseSensitive,
        multiline: true,
      });
      if (!compiled.success) return { success: false, error: compiled.error };
      matcher = compiled.value;
    }

    const nodes = await this.fileNodeRepo.findByProjectId(projectId);
    const files = nodes
      .filter((node) => node.type.value === 'file')
      .toSorted((a, b) => a.path.value.localeCompare(b.path.value));

    const groups: FileMatchGroup[] = [];
    let totalMatches = 0;
    let returnedMatches = 0;
    let skippedFiles = 0;
    // Set when a file's match evaluation is cut short by the per-file cap/deadline, so the reported
    // total is a lower bound; surfaced as `capped` so the client still shows the "refine" affordance.
    let truncated = false;

    for (const node of files) {
      const content = await this.readSearchableContent(projectId, node, input.limits.maxFileBytes);
      if (content === null) continue;
      if (content === SKIPPED) {
        skippedFiles += 1;
        continue;
      }

      const budget: MatchBudget = {
        maxMatches: PER_FILE_MATCH_LIMIT,
        deadline: Date.now() + input.limits.perFileTimeBudgetMs,
      };
      const spans = matcher ? matcher.matches(content, budget) : literalSpans(content, input, budget);
      if (spans.length === 0) continue;
      if (spans.length >= PER_FILE_MATCH_LIMIT) truncated = true;
      totalMatches += spans.length;

      const starts = lineStarts(content);
      const remaining = Math.max(0, input.limits.maxMatchesReturned - returnedMatches);
      const take = Math.min(spans.length, remaining);
      const matches: SearchMatch[] = [];
      for (let ordinal = 0; ordinal < take; ordinal += 1) {
        const span = spans[ordinal];
        const lineIndex = lineIndexAt(starts, span.from);
        matches.push({
          ordinal,
          line: lineIndex + 1,
          column: span.from - starts[lineIndex] + 1,
          from: span.from,
          to: span.to,
          lineText: lineTextAt(content, starts, lineIndex),
          matchText: span.groups[0] ?? '',
          groups: span.groups.map((group) => group ?? null),
          ...(span.named ? { named: mapNamed(span.named) } : {}),
        });
      }
      returnedMatches += take;

      groups.push({
        fileNodeId: node.id,
        path: stripLeadingSlash(node.path.value),
        matchCount: spans.length,
        matches,
      });
    }

    return {
      success: true,
      value: {
        groups,
        totalMatches,
        returnedMatches,
        capped: returnedMatches < totalMatches || truncated,
        skippedFiles,
      },
    };
  }

  /**
   * Resolves a file's searchable text: the live Yjs content when open, else the
   * store projection. Returns `null` when there is no content at all, the
   * {@link SKIPPED} sentinel when the file is binary or over the size budget, or
   * the decoded text otherwise.
   */
  private async readSearchableContent(
    projectId: ProjectId,
    node: FileNode,
    maxFileBytes: number,
  ): Promise<string | typeof SKIPPED | null> {
    const document = this.documentRepo ? await this.documentRepo.findByFileNodeId(node.id) : null;
    if (document && this.collaborativeContentReader) {
      const live = await this.collaborativeContentReader.readContent(projectId, document.yjsStateId);
      if (live.success && live.value !== null) {
        // Live rooms hold collaborative text, so no binary sniff is needed.
        return Buffer.byteLength(live.value, 'utf8') > maxFileBytes ? SKIPPED : live.value;
      }
      if (!live.success) {
        this.logger?.warn('Live content read failed during search; falling back to file store', {
          error: live.error.message,
        });
      }
    }

    const buffer = await this.fileStore.read(projectId, node.path);
    if (!buffer) return null;
    if (buffer.byteLength > maxFileBytes) return SKIPPED;
    if (!isSearchableTextFile(buffer.subarray(0, TEXT_SNIFF_BYTES))) return SKIPPED;
    return buffer.toString('utf8');
  }
}
