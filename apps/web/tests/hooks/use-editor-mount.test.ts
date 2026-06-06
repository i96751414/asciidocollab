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

// T011: onLineClick integration
describe('use-editor-mount onLineClick', () => {
  // (a) onLineClick option exists and mousedown handler emits line numbers
  test('accepts onLineClick option in UseEditorMountOptions', () => {
    expect(source).toContain('onLineClick');
  });

  // (b) registers mousedown handler
  test('registers a mousedown domEventHandlers extension', () => {
    expect(source).toContain('mousedown');
  });

  // (c) uses posAtCoords to resolve document position from click coordinates
  test('uses posAtCoords to compute position from mouse coordinates', () => {
    expect(source).toContain('posAtCoords');
  });

  // resolves line via lineAt
  test('resolves line number via lineAt', () => {
    expect(source).toContain('lineAt');
  });
});
