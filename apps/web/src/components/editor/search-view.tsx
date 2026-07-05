'use client';
import { CaseSensitive, WholeWord, Regex } from 'lucide-react';
import type { FileMatchGroupDto, SearchMatchDto } from '@asciidocollab/shared';
import { useProjectSearch } from '@/hooks/use-project-search';

/** Where a chosen result should open. */
export interface SearchResultTarget {
  /** The file node containing the match. */
  fileNodeId: string;
  /** Project-relative path of the file. */
  path: string;
  /** 1-based line of the match. */
  line: number;
  /** Char offset of the match start. */
  from: number;
  /** Char offset of the match end. */
  to: number;
}

interface SearchViewProperties {
  projectId: string;
  // Called when a result is activated so the layout opens the file and places the cursor on the match.
  onNavigate: (target: SearchResultTarget) => void;
}

/** A small option toggle (case, whole-word, regex) sharing the rail's active-accent treatment. */
function OptionToggle({ label, pressed, onPressedChange, children }: { label: string; pressed: boolean; onPressedChange: (next: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={() => onPressedChange(!pressed)}
      className={`flex h-6 w-6 items-center justify-center rounded border text-muted-foreground transition-colors ${
        pressed ? 'bg-primary/10 text-primary border-primary' : 'border-transparent hover:bg-accent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

/** Renders one line snippet with the matched substring highlighted. */
function MatchSnippet({ match }: { match: SearchMatchDto }) {
  const start = Math.max(0, match.column - 1);
  const end = Math.min(match.lineText.length, start + match.matchText.length);
  return (
    <span className="truncate">
      <span className="text-muted-foreground">{match.lineText.slice(0, start)}</span>
      <mark className="rounded-sm bg-primary/20 text-foreground">{match.lineText.slice(start, end)}</mark>
      <span className="text-muted-foreground">{match.lineText.slice(end)}</span>
    </span>
  );
}

/** A file group header plus its match rows. */
function ResultGroup({ group, onNavigate }: { group: FileMatchGroupDto; onNavigate: (target: SearchResultTarget) => void }) {
  return (
    <li>
      <div className="flex items-baseline gap-2 px-3 pt-2 pb-1">
        <span className="truncate text-xs font-medium text-foreground" title={group.path}>{group.path}</span>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{group.matchCount}</span>
      </div>
      <ul>
        {group.matches.map((match) => (
          <li key={match.ordinal}>
            <button
              type="button"
              aria-label={`Line ${match.line}: ${match.lineText}`}
              onClick={() => onNavigate({ fileNodeId: group.fileNodeId, path: group.path, line: match.line, from: match.from, to: match.to })}
              className="flex w-full items-baseline gap-2 py-0.5 pl-5 pr-3 text-left text-xs hover:bg-accent"
            >
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{match.line}</span>
              <MatchSnippet match={match} />
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * The left-panel Search tab: a project-wide find over every text-decodable file.
 * The header (fixed h-9) matches Files/Outline; the query input and case /
 * whole-word / regex toggles are styled from design tokens. Results are grouped
 * by file with per-file and true-total counts; activating a result opens its
 * file with the cursor on the match. An invalid regex shows an inline error and
 * nothing runs. Whole-project scope only — single-file find stays in the
 * in-editor panel.
 */
export function SearchView({ projectId, onNavigate }: SearchViewProperties) {
  const { query, setQuery, result, status, error } = useProjectSearch(projectId);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center px-2 border-b shrink-0 h-9">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search</span>
      </div>

      <div className="flex flex-col gap-1 border-b px-2 py-2 shrink-0">
        <div className="flex items-center gap-1 rounded border bg-background px-2 py-1">
          <input
            type="text"
            value={query.query}
            onChange={(event) => setQuery({ query: event.target.value })}
            placeholder="Search project…"
            aria-label="Search query"
            aria-invalid={error?.code === 'INVALID_PATTERN'}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <OptionToggle label="Match case" pressed={query.caseSensitive} onPressedChange={(v) => setQuery({ caseSensitive: v })}>
            <CaseSensitive className="h-4 w-4" />
          </OptionToggle>
          <OptionToggle label="Whole word" pressed={query.wholeWord} onPressedChange={(v) => setQuery({ wholeWord: v })}>
            <WholeWord className="h-4 w-4" />
          </OptionToggle>
          <OptionToggle label="Use regular expression" pressed={query.mode === 'regex'} onPressedChange={(v) => setQuery({ mode: v ? 'regex' : 'literal' })}>
            <Regex className="h-4 w-4" />
          </OptionToggle>
        </div>
        {error && (
          <p role="alert" className="px-1 text-xs text-destructive">
            {error.code === 'INVALID_PATTERN' ? `Invalid pattern: ${error.message}` : error.message}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === 'idle' && (
          <p className="px-3 py-4 text-xs text-muted-foreground">Type to search across every file in the project.</p>
        )}
        {status === 'loading' && (
          <p className="px-3 py-4 text-xs text-muted-foreground">Searching…</p>
        )}
        {status === 'success' && result && result.totalMatches === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground">No matches found.</p>
        )}
        {status === 'success' && result && result.totalMatches > 0 && (
          <>
            {result.capped && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                Showing {result.returnedMatches} of {result.totalMatches} matches — refine your search to see more.
              </p>
            )}
            <ul>
              {result.groups.map((group) => (
                <ResultGroup key={group.fileNodeId} group={group} onNavigate={onNavigate} />
              ))}
            </ul>
            {result.skippedFiles > 0 && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                {result.skippedFiles} file{result.skippedFiles === 1 ? '' : 's'} skipped (binary or too large).
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
