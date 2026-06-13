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

// T010 / US2: initialLine restores the cursor to a remembered line on mount, clamped to the
// current document length ("closest valid line", FR-005). This file runs in the `node` jest
// project (no DOM to mount a real EditorView), so behavior is pinned at the source level —
// matching the existing convention in this file.
describe('use-editor-mount initialLine restore', () => {
  test('accepts an initialLine option in UseEditorMountOptions', () => {
    expect(source).toContain('initialLine');
  });

  test('clamps the target line between 1 and the document line count', () => {
    // targetLine = min(max(initialLine, 1), doc.lines)
    expect(source).toContain('Math.min');
    expect(source).toContain('Math.max');
    expect(source).toContain('doc.lines');
  });

  test('scrolls the restored line into view on mount', () => {
    expect(source).toContain('scrollIntoView');
  });

  test('only applies the jump when initialLine is provided (guarded)', () => {
    // The mount effect must guard on initialLine so non-restore mounts are unaffected.
    expect(source).toMatch(/if\s*\(\s*initialLine/);
  });
});

// T064 / US8: live reveal request drives same-file go-to-definition (FR-049). Pinned at the
// source level (node project, no DOM EditorView) per this file's convention.
describe('use-editor-mount revealRequest (FR-049)', () => {
  test('accepts a revealRequest option', () => {
    expect(source).toContain('revealRequest');
  });

  test('reveals once per nonce (dedupes via a remembered nonce ref)', () => {
    expect(source).toContain('revealedNonceReference');
    expect(source).toMatch(/revealRequest\.nonce === revealedNonceReference\.current/);
  });

  test('moves the cursor to the requested line and scrolls it into view', () => {
    expect(source).toMatch(/clampToValidLine\(revealRequest\.line/);
    expect(source).toContain('scrollIntoView: true');
  });

  test('wires the project symbol index into the link handler for xref resolution', () => {
    expect(source).toContain('onNavigateToXref');
    expect(source).toMatch(/createLinkHandler\([\S\s]*projectIndexAccessor/);
  });

  test('shows an index-backed xref hover preview (FR-034)', () => {
    expect(source).toContain('xrefHoverPreview');
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
