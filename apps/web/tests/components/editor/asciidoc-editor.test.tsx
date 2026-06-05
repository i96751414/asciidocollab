import React from 'react';
import { render, screen } from '@testing-library/react';

function extractReadOnly(value: unknown): boolean | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = Object.fromEntries(Object.entries(value));
    if (typeof object['readOnly'] === 'boolean') return object['readOnly'];
  }
  return undefined;
}

// Mock CodeMirror EditorView since it requires a real DOM environment
jest.mock('@codemirror/view', () => {
  return {
    EditorView: class MockEditorView {
      dom: HTMLDivElement;
      state: { doc: { toString: () => string }; readOnly: boolean; selection: { main: { head: number } }; lines: number };
      private updateListeners: Array<(update: unknown) => void> = [];
      static updateListener = {
        of: (function_: unknown) => ({ _isUpdateListener: true, _fn: function_ }),
      };
      static lineWrapping = {};

      constructor({ state, parent }: {
        state: { doc: { toString: () => string }; readOnly?: boolean; _extensions?: unknown[] };
        parent: HTMLElement;
      }) {
        const readOnly = !!state.readOnly;
        this.dom = document.createElement('div');
        this.dom.setAttribute('contenteditable', readOnly ? 'false' : 'true');
        this.dom.dataset['testid'] = 'cm-editor';
        this.dom.textContent = state.doc.toString();
        this.state = {
          doc: {
            toString: () => state.doc.toString(),
            lineAt: (_pos: number) => ({ number: 1, from: 0, text: '' }),
            lines: 1,
          },
          readOnly,
          selection: { main: { head: 0 } },
          lines: 1,
          field: (_fieldDefinition: unknown) => [],
        };
        parent.append(this.dom);
        // Collect updateListener callbacks from state's extensions
        this.updateListeners = [];
        const scanExtensions = (extensions: unknown[]) => {
          for (const extension of extensions) {
            if (Array.isArray(extension)) { scanExtensions(extension); continue; }
            if (extension && typeof extension === 'object' && (extension as { _isUpdateListener?: boolean })._isUpdateListener) {
              this.updateListeners.push((extension as { _fn: (u: unknown) => void })._fn);
            }
          }
        };
        if ((state as { _extensions?: unknown[] })._extensions) {
          scanExtensions((state as { _extensions: unknown[] })._extensions);
        }
      }

      dispatch(transaction: { changes?: { insert?: string }; effects?: { readOnly?: boolean } | Array<{ readOnly?: boolean }> }) {
        let docChanged = false;
        if (transaction.changes && typeof transaction.changes.insert === 'string') {
          const newContent = transaction.changes.insert;
          this.state = {
            ...this.state,
            doc: {
              toString: () => newContent,
              lineAt: (_pos: number) => ({ number: 1, from: 0, text: '' }),
              lines: 1,
            },
          };
          this.dom.textContent = newContent;
          docChanged = true;
        }
        if (transaction.effects) {
          const effects = Array.isArray(transaction.effects) ? transaction.effects : [transaction.effects];
          for (const effect of effects) {
            if (typeof (effect as { readOnly?: boolean }).readOnly === 'boolean') {
              const ro = (effect as { readOnly: boolean }).readOnly;
              this.state = { ...this.state, readOnly: ro };
              this.dom.setAttribute('contenteditable', ro ? 'false' : 'true');
            }
          }
        }
        // Fire updateListeners so the editor component's state tracking works
        for (const listener of this.updateListeners) {
          listener({ docChanged, state: this.state });
        }
      }
      destroy() { this.dom.remove(); }
    },
    keymap:                { of: () => ({}) },
    lineNumbers:           () => ({}),
    highlightActiveLine:   () => ({}),
    highlightSpecialChars: () => ({}),
    drawSelection:         () => ({}),
    dropCursor:            () => ({}),
    rectangularSelection:  () => ({}),
    foldGutter:            () => ({}),
    crosshairCursor:       () => ({}),
    highlightActiveLineGutter: () => ({}),
  };
});

jest.mock('@codemirror/state', () => {
  return {
    EditorState: {
      create: (config: { doc: string; extensions?: unknown[] }) => {
        const extensions = config.extensions ?? [];
        let readOnly = false;
        function scan(array: unknown[]) {
          for (const extension of array) {
            if (Array.isArray(extension)) { scan(extension); continue; }
            const extracted = extractReadOnly(extension);
            if (extracted !== undefined) readOnly = extracted;
          }
        }
        scan(extensions);
        return { doc: { toString: () => config.doc }, readOnly, _extensions: extensions };
      },
      readOnly: { of: (value: boolean) => ({ readOnly: value }) },
    },
    StateField: {
      define: () => ({ field: true }),
    },
    StateEffect: {
      appendConfig: { of: (extension: unknown) => ({ appendConfig: extension }) },
      define: () => ({ of: (value: unknown) => ({ value }) }),
    },
    Compartment: class {
      of(extension: unknown) { return extension; }
      reconfigure(extension: unknown) { return extension; }
    },
  };
});

jest.mock('@codemirror/commands', () => ({
  history: () => ({}),
  defaultKeymap: [],
  historyKeymap: [],
}));

jest.mock('@codemirror/language', () => ({
  foldGutter: () => ({}),
  syntaxHighlighting: () => ({}),
  defaultHighlightStyle: {},
}));

jest.mock('@codemirror/search', () => ({
  search: () => ({}),
  searchKeymap: [],
}));

jest.mock('@/lib/codemirror/asciidoc-language', () => ({
  asciidoc: () => ({}),
}));

jest.mock('@codemirror/autocomplete', () => ({
  autocompletion: () => ({}),
  completionKeymap: [],
}));

jest.mock('@/lib/codemirror/asciidoc-completions', () => {
  const noopSource = jest.fn();
  return {
    attributeCompletionSource: noopSource,
    xrefCompletionSource: noopSource,
    createIncludeCompletionSource: jest.fn(() => noopSource),
    createImageCompletionSource: jest.fn(() => noopSource),
  };
});

jest.mock('@/lib/codemirror/asciidoc-link-handler', () => ({
  createLinkHandler: () => ({ handleMousedown: jest.fn() }),
}));

jest.mock('@/hooks/use-include-completions', () => ({
  useIncludeCompletions: () => [],
  useImagePaths: () => [],
}));

jest.mock('@/hooks/use-section-outline', () => ({
  useSectionOutline: jest.fn(() => []),
}));

jest.mock('@/lib/codemirror/asciidoc-outline', () => ({
  outlineField: { field: true },
}));

jest.mock('@replit/codemirror-minimap', () => ({
  showMinimap: { of: () => ({}) },
}));

jest.mock('@/hooks/use-editor-preferences', () => ({
  useEditorPreferences: jest.fn(() => ({ fontSize: 14, theme: 'default', setFontSize: jest.fn(), setTheme: jest.fn() })),
}));

jest.mock('@/lib/codemirror/asciidoc-highlight', () => ({
  asciidocHighlightStyle: {},
  asciidocHighlighting: () => ({}),
}));

jest.mock('@/lib/codemirror/asciidoc-fold', () => ({
  asciidocFold: {},
}));

jest.mock('@/lib/codemirror/asciidoc-table-context', () => ({
  tableContextField: { field: true },
}));

jest.mock('@/hooks/use-table-context', () => ({
  useTableContext: () => null,
}));

// Import after mocks
import { AsciiDocEditor } from '@/components/editor/asciidoc-editor';
import { useEditorPreferences } from '@/hooks/use-editor-preferences';

describe('AsciiDocEditor', () => {
  test('renders a CM6 editor element (not a <pre>) when given text content', () => {
    render(<AsciiDocEditor content="= Hello World\n\nSome text." canEdit={true} />);
    // Should have a CM6 editor element, not a <pre>
    expect(screen.queryByRole('code')).toBeNull();
    expect(screen.getByTestId('cm-editor')).toBeInTheDocument();
  });

  test('the editor is read-only when canEdit={false}', () => {
    render(<AsciiDocEditor content="Some text" canEdit={false} />);
    const editor = screen.getByTestId('cm-editor');
    expect(editor.getAttribute('contenteditable')).toBe('false');
  });

  test('the editor is editable when canEdit={true}', () => {
    render(<AsciiDocEditor content="Some text" canEdit={true} />);
    const editor = screen.getByTestId('cm-editor');
    expect(editor.getAttribute('contenteditable')).toBe('true');
  });

  test('component unmounts without errors', () => {
    const { unmount } = render(<AsciiDocEditor content="test" canEdit={true} />);
    expect(() => unmount()).not.toThrow();
  });

  // The editor tracks outline state internally via the CM6 updateListener, so
  // useSectionOutline is no longer needed or called from the editor component.
  test('editor renders the outline panel without calling useSectionOutline', () => {
    const { useSectionOutline } = jest.requireMock('@/hooks/use-section-outline');
    useSectionOutline.mockClear();
    render(<AsciiDocEditor content="== Heading\n\nBody" canEdit={true} />);
    expect(useSectionOutline).not.toHaveBeenCalled();
  });

  // Issue 6: canEdit prop changes after mount must update the editor's readOnly state
  test('editor becomes editable when canEdit prop changes from false to true', () => {
    const { rerender } = render(<AsciiDocEditor content="Some text" canEdit={false} />);
    expect(screen.getByTestId('cm-editor').getAttribute('contenteditable')).toBe('false');

    rerender(<AsciiDocEditor content="Some text" canEdit={true} />);

    expect(screen.getByTestId('cm-editor').getAttribute('contenteditable')).toBe('true');
  });

  test('editor becomes read-only when canEdit prop changes from true to false', () => {
    const { rerender } = render(<AsciiDocEditor content="Some text" canEdit={true} />);
    expect(screen.getByTestId('cm-editor').getAttribute('contenteditable')).toBe('true');

    rerender(<AsciiDocEditor content="Some text" canEdit={false} />);

    expect(screen.getByTestId('cm-editor').getAttribute('contenteditable')).toBe('false');
  });

  // Issue 5: outline must NOT depend on useSectionOutline being called during render.
  // Issue C8: when the content prop changes (e.g. external reload), the editor view must update
  test('updates editor content when content prop changes after mount', () => {
    const { rerender } = render(<AsciiDocEditor content="original content" canEdit={true} />);
    expect(screen.getByTestId('cm-editor')).toHaveTextContent('original content');

    rerender(<AsciiDocEditor content="externally updated content" canEdit={true} />);

    expect(screen.getByTestId('cm-editor')).toHaveTextContent('externally updated content');
  });

  // Issue 5: discardDraft must use OFFLINE_QUEUE_KEY_PREFIX so it stays in sync
  // if the constant is ever renamed.
  test('discardDraft removes the draft using OFFLINE_QUEUE_KEY_PREFIX, not a hardcoded string', () => {
    // Source-level structural check: the file must NOT contain the hardcoded prefix
    // literal. After the fix, only the imported constant is used.
    const fs = require('node:fs');
    const source: string = fs.readFileSync(
      require.resolve('@/components/editor/asciidoc-editor'),
      'utf8',
    );
    expect(source).not.toContain("'asciidocollab:editor-draft:'");
    expect(source).toContain('OFFLINE_QUEUE_KEY_PREFIX');
  });

  describe('font size and theme preferences', () => {
    const mockUseEditorPreferences = useEditorPreferences as jest.MockedFunction<typeof useEditorPreferences>;

    afterEach(() => {
      mockUseEditorPreferences.mockReset();
      mockUseEditorPreferences.mockImplementation(() => ({
        fontSize: 14, theme: 'default', setFontSize: jest.fn(), setTheme: jest.fn(),
      }));
    });

    // This test verifies the CSS rules that apply font-size and theme styles are
    // loaded.  Without the import, var(--editor-font-size) and [data-theme] have
    // no effect even though the DOM attributes are correctly set.
    test('editor-themes.css is imported so its CSS rules are active', () => {
      const fs = require('node:fs');
      const source: string = fs.readFileSync(
        require.resolve('@/components/editor/asciidoc-editor'),
        'utf8',
      );
      expect(source).toContain("import './editor-themes.css'");
    });

    test('editor wrapper applies --editor-font-size CSS variable from preference', () => {
      mockUseEditorPreferences.mockReturnValue({
        fontSize: 20, theme: 'default', setFontSize: jest.fn(), setTheme: jest.fn(),
      });
      const { container } = render(<AsciiDocEditor content="test" canEdit={true} />);
      const wrapper = container.querySelector('.asciidoc-editor');
      expect(wrapper).not.toBeNull();
      expect((wrapper as HTMLElement).style.getPropertyValue('--editor-font-size')).toBe('20px');
    });

    test('editor wrapper applies data-theme attribute from preference', () => {
      mockUseEditorPreferences.mockReturnValue({
        fontSize: 14, theme: 'high-contrast', setFontSize: jest.fn(), setTheme: jest.fn(),
      });
      const { container } = render(<AsciiDocEditor content="test" canEdit={true} />);
      const wrapper = container.querySelector('.asciidoc-editor');
      expect(wrapper).toHaveAttribute('data-theme', 'high-contrast');
    });

    test('editor wrapper updates --editor-font-size when font size preference changes', () => {
      mockUseEditorPreferences.mockReturnValue({
        fontSize: 16, theme: 'default', setFontSize: jest.fn(), setTheme: jest.fn(),
      });
      const { rerender, container } = render(<AsciiDocEditor content="test" canEdit={true} />);
      expect((container.querySelector('.asciidoc-editor') as HTMLElement).style.getPropertyValue('--editor-font-size')).toBe('16px');

      mockUseEditorPreferences.mockReturnValue({
        fontSize: 24, theme: 'default', setFontSize: jest.fn(), setTheme: jest.fn(),
      });
      rerender(<AsciiDocEditor content="test" canEdit={true} />);
      expect((container.querySelector('.asciidoc-editor') as HTMLElement).style.getPropertyValue('--editor-font-size')).toBe('24px');
    });
  });
});
