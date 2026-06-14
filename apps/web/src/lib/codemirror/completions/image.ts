import type { CompletionSource, CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { isImageFile } from '@/lib/codemirror/asciidoc-image-extensions';

/**
 * Image path completion source factory — triggers after "image::" or "image:".
 * Filters paths to image extensions only. On accept, inserts path[] with cursor between [ and ].
 */
export function createImageCompletionSource(paths: string[] | (() => string[])): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    // Match after 'image::' (block) or 'image:' (inline, not followed by another colon)
    const match = context.matchBefore(/image::?[^\n["]*/);
    if (!match) return null;

    // Reject matches that are preceded by an identifier character — e.g. "notimage::"
    // should not trigger, only standalone "image::" at a macro boundary.
    if (match.from > 0) {
      const charBefore = context.state.sliceDoc(match.from - 1, match.from);
      if (/[a-zA-Z0-9_]/.test(charBefore)) return null;
    }

    // Determine prefix after the trigger
    const text = match.text;
    const triggerLength = text.startsWith('image::') ? 'image::'.length : 'image:'.length;
    const prefix = text.slice(triggerLength);

    const currentPaths = typeof paths === 'function' ? paths() : paths;
    const filtered = currentPaths.filter((p) => isImageFile(p) && p.startsWith(prefix));

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
      from: match.from + triggerLength,
      options,
      filter: false,
    };
  };
}
