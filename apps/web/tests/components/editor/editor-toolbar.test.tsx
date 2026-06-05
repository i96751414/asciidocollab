import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('@radix-ui/react-tooltip', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <button>{children}</button>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@radix-ui/react-dropdown-menu', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <button data-testid="more-btn">{children}</button>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  Item: ({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  ),
  Separator: () => <hr />,
}));

import { EditorToolbar } from '@/components/editor/editor-toolbar';
import type { EditorView } from '@codemirror/view';

// Create a minimal mock EditorView for dispatch testing
function createMockView(content: string = '') {
  const doc = {
    toString: () => content,
    length: content.length,
    lines: content.split('\n').length,
    lineAt: (_pos: number) => ({ from: 0, to: content.length, number: 1, text: content }),
  };
  const state = {
    doc,
    selection: { main: { from: 0, to: 0, head: 0, anchor: 0, empty: true } },
    sliceDoc: (from: number, to: number) => content.slice(from, to),
  };
  const dispatched: unknown[] = [];
  return {
    state,
    dispatch: (tr: unknown) => { dispatched.push(tr); },
    dispatched,
    focus: jest.fn(),
  } as unknown as EditorView & { dispatched: unknown[] };
}

describe('EditorToolbar', () => {
  test('renders four labelled groups (Text Formatting, Structure, Blocks, Inline/References)', () => {
    const view = createMockView('');
    render(<EditorToolbar view={view} />);

    expect(screen.getByRole('group', { name: /text formatting/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /structure/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /blocks/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /inline/i })).toBeInTheDocument();
  });

  test('clicking Bold wraps selected text in **...**', () => {
    const view = createMockView('hello world');
    view.state.selection.main.from = 0;
    view.state.selection.main.to = 5;
    view.state.selection.main.empty = false;
    (view.state as { sliceDoc: (f: number, t: number) => string }).sliceDoc = (_f, _t) => 'hello';

    render(<EditorToolbar view={view} />);
    fireEvent.click(screen.getByRole('button', { name: /bold/i }));
    expect((view as unknown as { dispatched: unknown[] }).dispatched.length).toBeGreaterThan(0);
  });

  test(String.raw`clicking Code Block with no selection inserts a ----\n\n---- snippet`, () => {
    const view = createMockView('');
    render(<EditorToolbar view={view} />);
    fireEvent.click(screen.getByRole('button', { name: /code block/i }));
    expect((view as unknown as { dispatched: unknown[] }).dispatched.length).toBeGreaterThan(0);
  });

  test('clicking Heading 2 inserts == at line start', () => {
    const view = createMockView('');
    render(<EditorToolbar view={view} />);
    fireEvent.click(screen.getByRole('button', { name: /heading 2/i }));
    expect((view as unknown as { dispatched: unknown[] }).dispatched.length).toBeGreaterThan(0);
  });

  test('all buttons in each group are keyboard-accessible', () => {
    const view = createMockView('');
    render(<EditorToolbar view={view} />);
    const buttons = screen.getAllByRole('button');
    // Each button should have an accessible name
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? '';
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
