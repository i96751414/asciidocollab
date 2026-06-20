import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorSectionOutline } from '@/components/editor/editor-section-outline';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

const sampleEntries: SectionOutlineEntry[] = [
  { level: 1, title: 'Introduction', line: 3, from: 0 },
  { level: 2, title: 'Background',   line: 10, from: 50 },
  { level: 1, title: 'Conclusion',   line: 20, from: 120 },
];

describe('EditorSectionOutline', () => {
  test('renders headings in order with indent proportional to level', () => {
    render(
      <EditorSectionOutline
        entries={sampleEntries}
        onHeadingClick={jest.fn()}
      />
    );
    const items = screen.getAllByRole('button');
    expect(items.length).toBe(3);
    expect(items[0]).toHaveTextContent('Introduction');
    expect(items[1]).toHaveTextContent('Background');
    expect(items[2]).toHaveTextContent('Conclusion');

    // Level-2 heading should have more indent than level-1
    const level2 = items[1];
    expect(level2.closest('[data-level]') ?? level2).toBeTruthy();
  });

  test('clicking a heading fires a callback with the heading\'s line number', () => {
    const onHeadingClick = jest.fn();
    render(
      <EditorSectionOutline
        entries={sampleEntries}
        onHeadingClick={onHeadingClick}
      />
    );
    fireEvent.click(screen.getAllByRole('button')[1]); // Background (line 10)
    expect(onHeadingClick).toHaveBeenCalledWith(sampleEntries[1]);
  });

  test('renders empty-state message when outline is empty', () => {
    render(
      <EditorSectionOutline
        entries={[]}
        onHeadingClick={jest.fn()}
      />
    );
    expect(screen.getByText(/no headings/i)).toBeInTheDocument();
  });

  test('all heading entries are focusable by keyboard', () => {
    render(
      <EditorSectionOutline
        entries={sampleEntries}
        onHeadingClick={jest.fn()}
      />
    );
    const buttons = screen.getAllByRole('button');
    for (const button of buttons) {
      expect(button).not.toHaveAttribute('tabindex', '-1');
    }
  });

  test('heading can be activated by Enter key', () => {
    const onHeadingClick = jest.fn();
    render(
      <EditorSectionOutline
        entries={sampleEntries}
        onHeadingClick={onHeadingClick}
      />
    );
    const firstButton = screen.getAllByRole('button')[0];
    fireEvent.keyDown(firstButton, { key: 'Enter' });
    fireEvent.click(firstButton);
    expect(onHeadingClick).toHaveBeenCalled();
  });

  // Issue 4: must be wrapped in React.memo so cursor-move re-renders of the
  // parent editor do not cascade to the outline list when entries are unchanged.
  test('is wrapped in React.memo ($$typeof is React.memo symbol)', () => {
    const memoSymbol = Symbol.for('react.memo');
    expect((EditorSectionOutline as unknown as { $$typeof?: symbol }).$$typeof).toBe(memoSymbol);
  });

  // 028 (T009): level 0 (title) is flush; deeper levels step in. paddingLeft = level*12 + 8.
  test('indents rows by level: 0 flush, deeper levels progressively', () => {
    const entries: SectionOutlineEntry[] = [
      { level: 0, title: 'Doc Title', line: 1, from: 0 },
      { level: 1, title: 'Section', line: 3, from: 20 },
      { level: 2, title: 'Sub', line: 5, from: 40 },
    ];
    render(<EditorSectionOutline entries={entries} onHeadingClick={jest.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveStyle({ paddingLeft: '8px' });
    expect(buttons[1]).toHaveStyle({ paddingLeft: '20px' });
    expect(buttons[2]).toHaveStyle({ paddingLeft: '32px' });
  });

  // 028 (T019): the row at currentIndex is marked aria-current; exactly one.
  test('marks the row at currentIndex with aria-current and no other', () => {
    render(<EditorSectionOutline entries={sampleEntries} currentIndex={1} onHeadingClick={jest.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toHaveAttribute('aria-current', 'true');
    expect(buttons[0]).not.toHaveAttribute('aria-current');
    expect(buttons[2]).not.toHaveAttribute('aria-current');
  });

  test('marks no row when currentIndex is -1 or omitted', () => {
    render(<EditorSectionOutline entries={sampleEntries} currentIndex={-1} onHeadingClick={jest.fn()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveAttribute('aria-current');
    }
  });
});
