import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { CollabBinding } from '@/components/editor/asciidoc-editor';

// Coverage for the AsciiDoc editor's collaboration path: collab binding threading
// (collabExtension/remountKey), observer read-only gating, collab-unavailable banner,
// the presence bar, and the change/retry/draft handlers that branch on projectId/fileNodeId.

// Reuse the same CodeMirror mock shape as the main editor suite so the component can mount.
jest.mock('@codemirror/view', () => ({
  EditorView: class MockEditorView {
    dom: HTMLDivElement;
    scrollDOM: HTMLDivElement;
    state: { doc: { toString: () => string; length: number }; readOnly: boolean };
    constructor({ state, parent }: { state: { doc: { toString: () => string }; readOnly?: boolean }; parent: HTMLElement }) {
      const readOnly = !!state.readOnly;
      this.dom = document.createElement('div');
      this.dom.setAttribute('contenteditable', readOnly ? 'false' : 'true');
      this.dom.dataset['testid'] = 'cm-editor';
      this.dom.textContent = state.doc.toString();
      this.scrollDOM = document.createElement('div');
      this.state = { doc: { toString: () => state.doc.toString(), length: state.doc.toString().length }, readOnly };
      parent.append(this.dom);
    }
    dispatch() { /* no-op */ }
    destroy() { this.dom.remove(); }
  },
  keymap: { of: () => ({}) },
  hoverTooltip: () => ({}),
  lineNumbers: () => ({}),
  highlightActiveLine: () => ({}),
  highlightSpecialChars: () => ({}),
  drawSelection: () => ({}),
  dropCursor: () => ({}),
  rectangularSelection: () => ({}),
  foldGutter: () => ({}),
  crosshairCursor: () => ({}),
  highlightActiveLineGutter: () => ({}),
  ViewPlugin: { fromClass: () => ({}), define: () => ({}) },
  Decoration: { line: () => ({}), replace: () => ({}), none: { update: () => ({}) } },
  WidgetType: class {},
  GutterMarker: class {},
  gutter: () => ({}),
  EditorView_lineWrapping: {},
}));

jest.mock('@codemirror/language-data', () => ({ languages: [] }));
jest.mock('@codemirror/lint', () => ({ linter: () => ({}), lintGutter: () => ({}) }));
jest.mock('@codemirror/state', () => ({
  EditorState: {
    create: (config: { doc: string; extensions?: unknown[] }) => ({ doc: { toString: () => config.doc }, readOnly: false, _extensions: config.extensions ?? [] }),
    readOnly: { of: (value: boolean) => ({ readOnly: value }) },
  },
  StateField: { define: () => ({ field: true }) },
  Facet: { define: () => ({ of: (value: unknown) => ({ facet: value }) }) },
  StateEffect: { appendConfig: { of: (extension: unknown) => ({ appendConfig: extension }) }, define: () => ({ of: (value: unknown) => ({ value }) }) },
  Compartment: class { of(extension: unknown) { return extension; } reconfigure(extension: unknown) { return extension; } },
  Prec: { highest: (extension: unknown) => extension, high: (extension: unknown) => extension, default: (extension: unknown) => extension, low: (extension: unknown) => extension, lowest: (extension: unknown) => extension },
}));
jest.mock('@codemirror/commands', () => ({ history: () => ({}), defaultKeymap: [], historyKeymap: [] }));
jest.mock('@codemirror/language', () => ({ codeFolding: () => ({}), foldGutter: () => ({}), syntaxHighlighting: () => ({}), defaultHighlightStyle: {} }));
jest.mock('@codemirror/search', () => ({ search: () => ({}), searchKeymap: [] }));
jest.mock('@codemirror/autocomplete', () => ({ autocompletion: () => ({}), completionKeymap: [] }));
jest.mock('@/lib/codemirror/asciidoc-language', () => ({ asciidoc: () => ({}) }));
jest.mock('@/components/editor/editor-collab-extensions', () => ({
  collabExtensions: jest.fn(() => ({})),
  COLLAB_YTEXT_KEY: 'codemirror',
}));
jest.mock('@/lib/codemirror/asciidoc-completions', () => {
  const noopSource = jest.fn();
  return {
    createAttributeCompletionSource: jest.fn(() => noopSource),
    createXrefCompletionSource: jest.fn(() => noopSource),
    attributeCompletionSource: noopSource,
    xrefCompletionSource: noopSource,
    sourceLanguageCompletionSource: noopSource,
    tableSnippetCompletionSource: noopSource,
    tableCellCompletionSource: noopSource,
    captionCompletionSource: noopSource,
    createIncludeCompletionSource: jest.fn(() => noopSource),
    createImageCompletionSource: jest.fn(() => noopSource),
  };
});
jest.mock('@/lib/codemirror/asciidoc-link-handler', () => ({ createLinkHandler: () => ({ handleMousedown: jest.fn() }) }));
jest.mock('@/hooks/use-include-completions', () => ({ useIncludeCompletions: () => [], useImagePaths: () => [] }));
jest.mock('@/hooks/use-section-outline', () => ({
  useSectionOutline: jest.fn(() => ({ entries: [], effectiveScope: 'current', unresolved: [] })),
}));
jest.mock('@/lib/codemirror/asciidoc-outline', () => ({ outlineField: { field: true } }));
jest.mock('@replit/codemirror-minimap', () => ({ showMinimap: { of: () => ({}) } }));
jest.mock('@/lib/codemirror/asciidoc-theme', () => ({ asciidocTheme: [] }));
jest.mock('@/lib/codemirror/asciidoc-fold', () => ({ asciidocFold: {} }));
jest.mock('@/lib/codemirror/asciidoc-table-context', () => ({ tableContextField: { field: true } }));

jest.mock('@/hooks/use-editor-preferences', () => ({
  useEditorPreferences: () => ({ fontSize: 14, theme: 'default', softWrap: true, spellIgnore: [], setFontSize: jest.fn(), setTheme: jest.fn(), setSoftWrap: jest.fn() }),
}));

// Surface the collab presence bar so we can assert it renders on the collab path.
jest.mock('@/components/editor/collab-presence-bar', () => ({
  CollabPresenceBar: () => <div data-testid="presence-bar" />,
}));

// Capture the table context so the context-toolbar branch can be exercised.
let mockTableContext: { tableFrom: number; tableTo: number } | null = null;
jest.mock('@/hooks/use-table-context', () => ({ useTableContext: () => mockTableContext }));
jest.mock('@/components/editor/editor-table-context-toolbar', () => ({
  EditorTableContextToolbar: () => <div data-testid="table-toolbar" />,
}));

// Capture the mount-hook inputs so we can assert collabExtension/remountKey threading.
const mountSpy = jest.fn();
jest.mock('@/hooks/use-editor-mount', () => ({
  useEditorMount: (options: Record<string, unknown>) => {
    mountSpy(options);
    const containerReference = { current: document.createElement('div') };
    const viewReference = {
      current: {
        state: { doc: { toString: () => 'live content', length: 12, sliceString: () => 'tbl' } },
        dispatch: jest.fn(),
      },
    };
    return { containerReference, viewReference, handleHeadingClick: jest.fn() };
  },
}));

const mockSave = jest.fn();
let capturedDraftRecovered: ((draft: string) => void) | undefined;
let capturedExternalChange: (() => void) | undefined;
jest.mock('@/hooks/use-auto-save', () => ({
  useAutoSave: jest.fn((options: { onDraftRecovered?: (d: string) => void; onExternalChange?: () => void }) => {
    capturedDraftRecovered = options.onDraftRecovered;
    capturedExternalChange = options.onExternalChange;
    return { saveState: 'saved', save: mockSave };
  }),
}));

import { AsciiDocEditor } from '@/components/editor/asciidoc-editor';
import { useAutoSave } from '@/hooks/use-auto-save';
const mockUseAutoSave = useAutoSave as jest.Mock;

function makeBinding(role: 'editor' | 'observer'): CollabBinding {
  return {
    doc: {} as unknown as Y.Doc,
    awareness: {} as unknown as Awareness,
    connectionState: 'synced',
    role,
    yjsStateId: 'y-room-1',
  };
}

beforeEach(() => {
  mountSpy.mockClear();
  mockSave.mockClear();
  mockUseAutoSave.mockClear();
  mockTableContext = null;
  capturedDraftRecovered = undefined;
  capturedExternalChange = undefined;
});

describe('AsciiDocEditor — collaboration path', () => {
  test('threads the collab extension and the room id as the remount key into the mount hook', () => {
    render(<AsciiDocEditor content="x" canEdit collab={makeBinding('editor')} projectId="p1" fileNodeId="f1" />);
    const options = mountSpy.mock.calls.at(-1)?.[0];
    expect(options.collabExtension).toBeDefined();
    expect(options.remountKey).toBe('y-room-1');
  });

  test('renders the presence bar when a collab binding is present', () => {
    render(<AsciiDocEditor content="x" canEdit collab={makeBinding('editor')} projectId="p1" fileNodeId="f1" />);
    expect(screen.getByTestId('presence-bar')).toBeInTheDocument();
  });

  test('disables autosave on the collab path (collaboration server owns persistence)', () => {
    render(<AsciiDocEditor content="x" canEdit collab={makeBinding('editor')} projectId="p1" fileNodeId="f1" />);
    expect(mockUseAutoSave).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  test('an observer gets a read-only editor even when canEdit is true', () => {
    render(<AsciiDocEditor content="x" canEdit collab={makeBinding('observer')} projectId="p1" fileNodeId="f1" />);
    expect(mountSpy.mock.calls.at(-1)?.[0].canEdit).toBe(false);
  });

  test('passes the initial etag through to autosave when provided', () => {
    render(<AsciiDocEditor content="x" canEdit projectId="p1" fileNodeId="f1" initialEtag="etag-123" />);
    expect(mockUseAutoSave).toHaveBeenCalledWith(expect.objectContaining({ initialEtag: 'etag-123' }));
  });
});

describe('AsciiDocEditor — collab-unavailable read-only fallback', () => {
  test('forces read-only and disables autosave', () => {
    render(<AsciiDocEditor content="x" canEdit projectId="p1" fileNodeId="f1" collabUnavailable />);
    expect(mountSpy.mock.calls.at(-1)?.[0].canEdit).toBe(false);
    expect(mockUseAutoSave).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe('AsciiDocEditor — change handler branches', () => {
  test('a change saves and forwards to onChange when projectId+fileNodeId are set', () => {
    const onChange = jest.fn();
    render(<AsciiDocEditor content="x" canEdit projectId="p1" fileNodeId="f1" onChange={onChange} />);
    const onDocChange = mountSpy.mock.calls.at(-1)?.[0].onDocChange;
    act(() => { onDocChange('typed'); });
    expect(mockSave).toHaveBeenCalledWith('typed');
    expect(onChange).toHaveBeenCalledWith('typed');
  });

  test('a change without projectId/fileNodeId still forwards to onChange but does not save', () => {
    const onChange = jest.fn();
    render(<AsciiDocEditor content="x" canEdit onChange={onChange} />);
    const onDocChange = mountSpy.mock.calls.at(-1)?.[0].onDocChange;
    act(() => { onDocChange('typed'); });
    expect(mockSave).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('typed');
  });

  test('cursor changes report the line up for persistence', () => {
    const onCursorLineChange = jest.fn();
    render(<AsciiDocEditor content="x" canEdit onCursorLineChange={onCursorLineChange} />);
    const onCursorChange = mountSpy.mock.calls.at(-1)?.[0].onCursorChange;
    act(() => { onCursorChange({ line: 4, col: 2, totalLines: 10 }); });
    expect(onCursorLineChange).toHaveBeenCalledWith(4);
  });
});

describe('AsciiDocEditor — table context toolbar', () => {
  test('renders the table toolbar when an editable table context is active', () => {
    mockTableContext = { tableFrom: 0, tableTo: 3 };
    render(<AsciiDocEditor content="|===" canEdit projectId="p1" fileNodeId="f1" />);
    expect(screen.getByTestId('table-toolbar')).toBeInTheDocument();
  });

  test('hides the table toolbar for a read-only (observer) editor', () => {
    mockTableContext = { tableFrom: 0, tableTo: 3 };
    render(<AsciiDocEditor content="|===" canEdit collab={makeBinding('observer')} projectId="p1" fileNodeId="f1" />);
    expect(screen.queryByTestId('table-toolbar')).not.toBeInTheDocument();
  });
});

describe('AsciiDocEditor — retry & draft handlers', () => {
  afterEach(() => {
    mockUseAutoSave.mockImplementation((options: { onDraftRecovered?: (d: string) => void; onExternalChange?: () => void }) => {
      capturedDraftRecovered = options.onDraftRecovered;
      capturedExternalChange = options.onExternalChange;
      return { saveState: 'saved', save: mockSave };
    });
  });

  test('retry saves the current editor view content', () => {
    mockUseAutoSave.mockReturnValue({ saveState: 'error', save: mockSave });
    render(<AsciiDocEditor content="x" canEdit projectId="p1" fileNodeId="f1" />);
    fireEvent.click(screen.getByRole('button', { name: /retry save/i }));
    expect(mockSave).toHaveBeenCalledWith('live content');
  });

  test('restoring a recovered draft dispatches the insert and saves it', () => {
    render(<AsciiDocEditor content="x" canEdit projectId="p1" fileNodeId="f1" />);
    act(() => capturedDraftRecovered?.('recovered text'));
    fireEvent.click(screen.getByRole('button', { name: /restore/i }));
    expect(mockSave).toHaveBeenCalledWith('recovered text');
  });

  test('discarding a draft clears local storage for the file', () => {
    const removeSpy = jest.spyOn(Storage.prototype, 'removeItem');
    render(<AsciiDocEditor content="x" canEdit projectId="p1" fileNodeId="f1" />);
    act(() => capturedDraftRecovered?.('recovered text'));
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(removeSpy).toHaveBeenCalledWith(expect.stringContaining('f1'));
    removeSpy.mockRestore();
  });
});

describe('AsciiDocEditor — external-change banner', () => {
  test('shows the external-change banner when autosave reports a remote edit, and dismisses it', () => {
    render(<AsciiDocEditor content="x" canEdit projectId="p1" fileNodeId="f1" />);
    act(() => capturedExternalChange?.());
    const dismiss = screen.getByRole('button', { name: /dismiss/i });
    expect(dismiss).toBeInTheDocument();
    fireEvent.click(dismiss);
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });
});

describe('AsciiDocEditor — plain-text (non-AsciiDoc) chrome', () => {
  test('hides the toolbar and outline panel for non-AsciiDoc files', () => {
    render(<AsciiDocEditor content="plain" canEdit isAsciiDoc={false} projectId="p1" fileNodeId="f1" />);
    expect(screen.queryByRole('button', { name: /collapse outline panel/i })).not.toBeInTheDocument();
  });

  test('omits the status bar when projectId/fileNodeId are absent', () => {
    render(<AsciiDocEditor content="plain" canEdit />);
    expect(screen.queryByText(/Ln/i)).not.toBeInTheDocument();
  });
});
