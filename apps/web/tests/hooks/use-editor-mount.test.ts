import fs from 'node:fs';

const source: string = fs.readFileSync(
  require.resolve('@/hooks/use-editor-mount'),
  'utf8',
);

describe('use-editor-mount completion sources', () => {
  test('imports tableSnippetCompletionSource from asciidoc-completions', () => {
    expect(source).toContain('tableSnippetCompletionSource');
  });

  test('imports tableCellCompletionSource from asciidoc-completions', () => {
    expect(source).toContain('tableCellCompletionSource');
  });

  test('imports captionCompletionSource from asciidoc-completions', () => {
    expect(source).toContain('captionCompletionSource');
  });
});
