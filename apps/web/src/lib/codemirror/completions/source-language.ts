import type { CompletionSource, CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { listSourceLanguageTokens } from '@/lib/codemirror/source-languages';

/** Source-language completion — triggers inside `[source,<here>]`. */
export const sourceLanguageCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/\[source,\s*[\w+#.-]*/);
  if (!match) return null;
  const afterComma = match.text.slice(match.text.indexOf(',') + 1);
  const prefix = afterComma.trimStart().toLowerCase();
  const from = match.to - prefix.length;
  const options: Completion[] = listSourceLanguageTokens()
    .filter((token) => token.startsWith(prefix))
    .map((label) => ({ label, type: 'type' }));
  return { from, options, filter: false };
};
