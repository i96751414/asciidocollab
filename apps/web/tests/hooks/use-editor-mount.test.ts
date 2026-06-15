import fs from 'node:fs';

const source: string = fs.readFileSync(
  require.resolve('@/hooks/use-editor-mount'),
  'utf8',
);

// The CodeMirror extension assembly and the DOM-level handlers were extracted from the hook into
// dedicated modules (Single Responsibility). The source-level assertions below now read whichever
// module physically owns each concern: the hook orchestrates the lifecycle/effects, the extensions
// module assembles the extension array, and the dom-handlers module owns the drop/line-click/
// scroll/hover handlers.
const extensionsSource: string = fs.readFileSync(
  require.resolve('@/lib/codemirror/editor-extensions'),
  'utf8',
);

const domHandlersSource: string = fs.readFileSync(
  require.resolve('@/lib/codemirror/editor-dom-handlers'),
  'utf8',
);

describe('editor-extensions completion sources', () => {
  test('imports tableSnippetCompletionSource from asciidoc-completions', () => {
    expect(extensionsSource).toContain('tableSnippetCompletionSource');
  });

  test('imports tableCellCompletionSource from asciidoc-completions', () => {
    expect(extensionsSource).toContain('tableCellCompletionSource');
  });

  test('imports captionCompletionSource from asciidoc-completions', () => {
    expect(extensionsSource).toContain('captionCompletionSource');
  });
});

// T011: onLineClick integration. The hook still accepts the option and wires the handler extension;
// the handler body (posAtCoords → lineAt) now lives in the dom-handlers module.
describe('use-editor-mount onLineClick', () => {
  test('accepts onLineClick option in UseEditorMountOptions', () => {
    expect(source).toContain('onLineClick');
  });

  test('registers a mousedown domEventHandlers extension', () => {
    expect(domHandlersSource).toContain('mousedown');
  });

  test('uses posAtCoords to compute position from mouse coordinates', () => {
    expect(domHandlersSource).toContain('posAtCoords');
  });

  test('resolves line number via lineAt', () => {
    expect(domHandlersSource).toContain('lineAt');
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
    expect(domHandlersSource).toContain('xrefHoverPreview');
  });
});

// T066 / US3: the inherited include-path offset feeds heading levels and re-evaluates on change.
// The heading-levels extension is assembled in the extensions module; the change-driven refresh
// effect stays in the hook.
describe('use-editor-mount inherited heading offset (FR-071/045a)', () => {
  test('passes a lazy inherited-offset accessor to asciidocHeadingLevels', () => {
    expect(extensionsSource).toMatch(/asciidocHeadingLevels\(getInheritedOffset\)/);
    expect(source).toMatch(/getInheritedOffset: \(\) => inheritedOffsetReference\.current/);
  });

  test('dispatches a heading-levels refresh when the inherited offset changes', () => {
    expect(source).toContain('refreshHeadingLevelsEffect');
    expect(source).toMatch(/}, \[inheritedOffset]\)/);
  });
});

// Scroll sync: the hook wires the listener via wireScrollSync; the listener implementation
// (scrollDOM + passive 'scroll' listener + debounce) lives in the dom-handlers module.
describe('use-editor-mount scroll sync', () => {
  test('accepts onScrollLine option in UseEditorMountOptions', () => {
    expect(source).toContain('onScrollLine');
  });

  test('adds a scroll event listener on view.scrollDOM', () => {
    expect(domHandlersSource).toContain('scrollDOM');
    expect(domHandlersSource).toContain("'scroll'");
  });

  test('uses passive scroll listener to avoid blocking scroll', () => {
    expect(domHandlersSource).toContain('passive');
  });

  test('removes scroll listener on cleanup', () => {
    expect(domHandlersSource).toContain('removeEventListener');
  });
});
