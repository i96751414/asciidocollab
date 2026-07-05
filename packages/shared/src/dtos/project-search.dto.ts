/**
 * @file HTTP-boundary DTOs for the project-wide search route. Wire shapes only:
 * these are the request/response contract between the web client and the API and
 * are NEVER imported by `packages/domain` — the search route maps them to/from
 * the domain-owned `SearchQuery`/`SearchResult` types.
 */

/** How the query string is interpreted. */
export type SearchMode = 'literal' | 'regex';

/** A project-wide search request body. */
export interface SearchQueryDto {
  /** The literal text or regular-expression source (1..maxPatternLength). */
  query: string;
  /** Whether `query` is a literal or a regular expression. */
  mode: SearchMode;
  /** Case-sensitive when true. */
  caseSensitive: boolean;
  /** Whole-word only; ignored/false in regex mode (use `\b` in the pattern). */
  wholeWord: boolean;
}

/** One match within a file. */
export interface SearchMatchDto {
  /** 0-based index of this match within its file (identity for replace). */
  ordinal: number;
  /** 1-based line of the match start (for display + navigation). */
  line: number;
  /** 1-based column of the match start. */
  column: number;
  /** Char offset of the match start at scan time (navigation only; NOT used to apply). */
  from: number;
  /** Char offset of the match end at scan time. */
  to: number;
  /** The match's line, for the context snippet. */
  lineText: string;
  /** Exact matched substring (the `expectedText` for a replace selection). */
  matchText: string;
  /**
   * Capture groups: index 0 is the whole match, index n the nth group (null when a group did not
   * participate). Lets the client preview a regex `$n` replacement without re-running the engine.
   */
  groups: (string | null)[];
  /** Named capture groups, when the pattern defines any (for a `${name}` preview). */
  named?: Record<string, string | null>;
}

/** All matches grouped under one file. */
export interface FileMatchGroupDto {
  /** The file node's identifier. */
  fileNodeId: string;
  /** Project-relative path, no leading slash. */
  path: string;
  /** Matches in this file (may exceed `matches.length` when the result is capped). */
  matchCount: number;
  /** The returned matches for this file, in document order. */
  matches: SearchMatchDto[];
}

/** The project-wide search response payload. */
export interface SearchResultDto {
  /** File groups, ordered by path. */
  groups: FileMatchGroupDto[];
  /** TRUE total of matches across the project. */
  totalMatches: number;
  /** Number of matches actually included (<= maxMatchesReturned). */
  returnedMatches: number;
  /** True when `returnedMatches < totalMatches`. */
  capped: boolean;
  /** Files excluded by size/binary detection (reported, not silent). */
  skippedFiles: number;
}
