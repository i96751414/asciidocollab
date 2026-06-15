import type { CompletionSource, CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { relativeIncludePath } from '@/lib/asciidoc/include-path';

/**
 * Include path completion source factory — triggers after "include::".
 * Supports mid-path narrowing: after typing a prefix like "docs/", completions
 * narrow to only paths starting with that prefix (FR-IN-002).
 *
 * Offered paths are relativized to the authoring file (`getFromPath`) so the
 * inserted target resolves correctly under Asciidoctor's file-relative rules.
 */
export function createIncludeCompletionSource(
  paths: string[] | (() => string[]),
  getFromPath: () => string | null = () => null,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/include::[^\n[]*/);
    if (!match) return null;

    const fromPath = getFromPath();
    const currentPaths = (typeof paths === 'function' ? paths() : paths).map((p) => relativeIncludePath(fromPath, p));
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
