import type { CompletionSource, CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';

/**
 * Caption completion source — triggers when "." is typed at column 0.
 * Offers a ".Caption text" placeholder with cursor selecting "Caption text".
 */
export const captionCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/\./);
  if (!match) return null;

  // Only trigger when . is at column 0
  const line = context.state.doc.lineAt(context.pos);
  if (match.from !== line.from) return null;

  const captionText = 'Caption text';
  const fullLabel = `.${captionText}`;

  const option: Completion = {
    label: fullLabel,
    type: 'keyword',
    detail: 'block caption',
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: fullLabel },
        selection: { anchor: from + 1, head: from + fullLabel.length },
      });
    },
  };

  return {
    from: match.from,
    options: [option],
    filter: false,
  };
};
