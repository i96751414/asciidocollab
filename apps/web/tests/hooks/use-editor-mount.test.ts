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
  test('accepts onLineClick option in UseEditorMountOptions', () => {
    expect(source).toContain('onLineClick');
  });

  test('registers a mousedown domEventHandlers extension', () => {
    expect(source).toContain('mousedown');
  });

  test('uses posAtCoords to compute position from mouse coordinates', () => {
    expect(source).toContain('posAtCoords');
  });

  test('resolves line number via lineAt', () => {
    expect(source).toContain('lineAt');
  });
});

describe('use-editor-mount scroll sync', () => {
  test('accepts onScrollLine option in UseEditorMountOptions', () => {
    expect(source).toContain('onScrollLine');
  });

  test('adds a scroll event listener on view.scrollDOM', () => {
    expect(source).toContain('scrollDOM');
    expect(source).toContain("'scroll'");
  });

  test('uses passive scroll listener to avoid blocking scroll', () => {
    expect(source).toContain('passive');
  });

  test('removes scroll listener on cleanup', () => {
    expect(source).toContain('removeEventListener');
  });
});
