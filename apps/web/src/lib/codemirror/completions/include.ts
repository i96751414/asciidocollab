import type { CompletionSource, CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';

/**
 * Include path completion source factory — triggers after "include::".
 * Supports mid-path narrowing: after typing a prefix like "docs/", completions
 * narrow to only paths starting with that prefix (FR-IN-002).
 */
export function createIncludeCompletionSource(paths: string[] | (() => string[])): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/include::[^\n[]*/);
    if (!match) return null;

    const currentPaths = typeof paths === 'function' ? paths() : paths;
    const prefix = match.text.slice('include::'.length);
    const filtered = currentPaths.filter((filePath) => filePath.startsWith(prefix));

    const options: Completion[] = filtered.map((label) => ({
      label,
      type: 'file',
      apply: (view, _completion, from, to) => {
        view.dispatch({
          changes: { from, to, insert: `${label}[]` },
          selection: { anchor: from + label.length + 1 },
        });
      },
    }));

    return {
      from: match.from + 'include::'.length,
      options,
      filter: false,
    };
  };
}
