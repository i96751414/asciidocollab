import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { OutlineView } from '@/components/editor/outline-view';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';

const entries: SectionOutlineEntry[] = [
  { level: 0, title: 'My Document', line: 1, from: 0 },
  { level: 1, title: 'Introduction', line: 4, from: 20 },
  { level: 2, title: 'Background', line: 8, from: 50 },
  { level: 1, title: 'Conclusion', line: 20, from: 120 },
];

describe('OutlineView', () => {
  test('renders an "Outline" header (its own, matching the file tree header)', () => {
    render(<OutlineView entries={entries} currentLine={null} hasDocument onHeadingClick={jest.fn()} />);
    expect(screen.getByText('Outline')).toBeInTheDocument();
  });

  test('renders every heading in document order, nested by level', () => {
    render(<OutlineView entries={entries} currentLine={null} hasDocument onHeadingClick={jest.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['My Document', 'Introduction', 'Background', 'Conclusion']);
    // Title flush at 8px, deeper levels step in.
    expect(buttons[0]).toHaveStyle({ paddingLeft: '8px' });
    expect(buttons[2]).toHaveStyle({ paddingLeft: '32px' });
  });

  test('clicking a row calls onHeadingClick with the entry', () => {
    const onHeadingClick = jest.fn();
    render(<OutlineView entries={entries} currentLine={null} hasDocument onHeadingClick={onHeadingClick} />);
    fireEvent.click(screen.getAllByRole('button')[2]);
    expect(onHeadingClick).toHaveBeenCalledWith(entries[2]);
  });

  test('marks the current section based on currentLine', () => {
    render(<OutlineView entries={entries} currentLine={10} hasDocument onHeadingClick={jest.fn()} />);
    const buttons = screen.getAllByRole('button');
    // line 10 → nearest preceding heading is Background (line 8) at index 2.
    expect(buttons[2]).toHaveAttribute('aria-current', 'true');
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'true')).toHaveLength(1);
  });

  test('shows the no-document empty state when hasDocument is false', () => {
    render(<OutlineView entries={[]} currentLine={null} hasDocument={false} onHeadingClick={jest.fn()} />);
    expect(screen.getByText('Open a document to see its outline.')).toBeInTheDocument();
  });

  test('shows the no-headings empty state when a document is open but has no headings', () => {
    render(<OutlineView entries={[]} currentLine={null} hasDocument onHeadingClick={jest.fn()} />);
    expect(screen.getByText('No headings yet — add a section title (=, ==, …).')).toBeInTheDocument();
  });
});
