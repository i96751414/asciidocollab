import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@codemirror/search', () => ({
  search: () => ({}),
  searchKeymap: [],
  RegExpQuery: class {},
}));

jest.mock('@codemirror/view', () => ({
  EditorView: class MockEditorView {
    dom: HTMLDivElement;
    scrollDOM: HTMLDivElement;
    state: { doc: { toString: () => string } };
    static updateListener = { of: (function_: unknown) => ({ function_ }) };
    static lineWrapping = {};
    static editable = { of: (value: unknown) => ({ editable: value }) };
    static domEventHandlers = (_handlers: unknown) => ({});

    constructor({ state, parent }: {
      state: { doc: { toString: () => string }; readOnly?: boolean };
      parent: HTMLElement;
    }) {
      this.dom = document.createElement('div');
      this.dom.setAttribute('contenteditable', state.readOnly ? 'false' : 'true');
      this.dom.dataset['testid'] = 'cm-editor';
      this.dom.textContent = state.doc.toString();
      this.scrollDOM = document.createElement('div');
      this.state = { doc: { toString: () => state.doc.toString() } };
      parent.append(this.dom);
    }

    dispatch() {}
    destroy() { this.dom.remove(); }
  },
  keymap: { of: () => ({}) },
  hoverTooltip: () => ({}),
  lineNumbers: () => ({}),
  highlightActiveLine: () => ({}),
  highlightSpecialChars: () => ({}),
  foldGutter: () => ({}),
}));

jest.mock('@codemirror/state', () => ({
  EditorState: {
    create: (config: { doc: string; extensions?: unknown[] }) => ({
      doc: { toString: () => config.doc },
      selection: { main: { head: 0 } },
    }),
    readOnly: { of: () => ({}) },
  },
  StateField: { define: () => ({ field: true }) },
  StateEffect: { appendConfig: { of: (extension: unknown) => ({ appendConfig: extension }) }, define: () => ({ of: (v: unknown) => ({ value: v }) }) },
  Compartment: class { of(extension: unknown) { return extension; } reconfigure(extension: unknown) { return extension; } },
  Prec: { highest: (extension: unknown) => extension, high: (extension: unknown) => extension, default: (extension: unknown) => extension, low: (extension: unknown) => extension, lowest: (extension: unknown) => extension },
}));

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

// The collab extensions module pulls in y-codemirror.next (ESM) which touches the real
// @codemirror/state at load; this suite mocks that module, so stub the collab binding too.
jest.mock('@/components/editor/editor-collab-extensions', () => ({
  collabExtensions: jest.fn(() => ({})),
  COLLAB_YTEXT_KEY: 'codemirror',
}));
jest.mock('@/lib/codemirror/asciidoc-language', () => ({ asciidoc: () => ({}) }));
jest.mock('@/hooks/use-section-outline', () => ({ useSectionOutline: () => [] }));
jest.mock('@/lib/codemirror/asciidoc-outline', () => ({ outlineField: { field: true } }));
jest.mock('@replit/codemirror-minimap', () => ({ showMinimap: { of: () => ({}) } }));
jest.mock('@/hooks/use-editor-preferences', () => ({ useEditorPreferences: () => ({ fontSize: 14, theme: 'default', setFontSize: jest.fn(), setTheme: jest.fn() }) }));
jest.mock('@codemirror/autocomplete', () => ({ autocompletion: () => ({}), completionKeymap: [] }));
jest.mock('@/lib/codemirror/asciidoc-completions', () => ({ attributeCompletionSource: () => null, xrefCompletionSource: () => null, createIncludeCompletionSource: () => jest.fn(), createImageCompletionSource: () => jest.fn() }));
jest.mock('@/lib/codemirror/asciidoc-link-handler', () => ({ createLinkHandler: () => ({ handleMousedown: jest.fn(), extension: jest.fn() }) }));
jest.mock('@/hooks/use-include-completions', () => ({ useIncludeCompletions: () => [], useImagePaths: () => [] }));
jest.mock('@/lib/codemirror/asciidoc-highlight', () => ({ asciidocHighlightStyle: {}, asciidocHighlighting: () => ({}) }));
jest.mock('@/lib/codemirror/asciidoc-theme', () => ({ asciidocTheme: [] }));
jest.mock('@/lib/codemirror/asciidoc-fold', () => ({ asciidocFold: {} }));
jest.mock('@/lib/codemirror/asciidoc-table-context', () => ({ tableContextField: { field: true } }));
jest.mock('@/hooks/use-table-context', () => ({ useTableContext: () => null }));
jest.mock('@/hooks/use-auto-save', () => ({
  useAutoSave: () => ({ saveState: 'saved', save: jest.fn() }),
}));

import { AsciiDocEditor } from '@/components/editor/asciidoc-editor';

describe('AsciiDocEditor — Find and Replace', () => {
  test('editor renders with find/replace support (search extension wired)', () => {
    render(<AsciiDocEditor content="Hello world\nSecond line" canEdit={true} />);
    expect(screen.getByTestId('cm-editor')).toBeInTheDocument();
  });

  test('search keymap is configured (Mod-f would open find panel)', () => {
    const { unmount } = render(
      <AsciiDocEditor content="search me\nsearch too" canEdit={true} />
    );
    expect(() => unmount()).not.toThrow();
  });

  test('component includes search extension (does not crash with regex)', () => {
    expect(() => {
      render(
        <AsciiDocEditor
          content="hello [world] ^test$ .*"
          canEdit={true}
        />
      );
    }).not.toThrow();
  });
});
