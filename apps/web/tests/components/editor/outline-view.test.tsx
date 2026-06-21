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

// T010: OutlineView full-document mode (feature 032)
describe('OutlineView — full-document mode (feature 032)', () => {
  const fullEntries: SectionOutlineEntry[] = [
    { level: 0, title: 'Root Title', line: 1, from: 0, sourceFileId: 'id-main', sourcePath: 'main.adoc', sourceLine: 1, isOpenFile: true },
    { level: 1, title: 'Main Section', line: 3, from: 20, sourceFileId: 'id-main', sourcePath: 'main.adoc', sourceLine: 3, isOpenFile: true },
    { level: 1, title: 'Child Section', line: 6, from: 80, sourceFileId: 'id-ch', sourcePath: 'ch.adoc', sourceLine: 1, isOpenFile: false },
    { level: 1, title: 'After Include', line: 8, from: 130, sourceFileId: 'id-main', sourcePath: 'main.adoc', sourceLine: 7, isOpenFile: true },
  ];

  test('full-scope: renders all entries from all files as one seamless flat list', () => {
    render(
      <OutlineView
        entries={fullEntries}
        currentLine={null}
        hasDocument
        effectiveScope="full"
        onHeadingClick={jest.fn()}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByText('Root Title')).toBeInTheDocument();
    expect(screen.getByText('Child Section')).toBeInTheDocument();
    expect(screen.getByText('After Include')).toBeInTheDocument();
    expect(screen.queryByRole('separator')).toBeNull();
  });

  test('full-scope: current-section marks the nearest open-file entry (FR-011)', () => {
    // Cursor at line 4 in the open file — nearest open-file heading is Main Section (line 3)
    render(
      <OutlineView
        entries={fullEntries}
        currentLine={4}
        hasDocument
        effectiveScope="full"
        onHeadingClick={jest.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    // index 1 = 'Main Section' (isOpenFile=true, line 3) should be current
    expect(buttons[1]).toHaveAttribute('aria-current', 'true');
    // Exactly one aria-current
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'true')).toHaveLength(1);
  });

  test('full-scope: foreign-file entries never get aria-current even if cursor line matches their sourceLine', () => {
    // Cursor hypothetically at the assembled line of the child section
    render(
      <OutlineView
        entries={fullEntries}
        currentLine={6}
        hasDocument
        effectiveScope="full"
        onHeadingClick={jest.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    // index 2 = 'Child Section' is from a foreign file — it must NOT be current
    expect(buttons[2]).not.toHaveAttribute('aria-current');
  });

  // The cursor's `currentLine` is a line in the OPEN file, so the current-section match must be made
  // against each open-file entry's `sourceLine` (its line within that file), NOT its assembled `line`
  // — those diverge once an include shifts later sections down in the assembled document.
  test('full-scope: current section uses the open file source line, not the assembled line', () => {
    // 'After Include' sits at assembled line 8 but open-file source line 7. With the cursor on the
    // open file's line 7 it is the current section; comparing against the assembled line would wrongly
    // mark 'Main Section'.
    render(
      <OutlineView
        entries={fullEntries}
        currentLine={7}
        hasDocument
        effectiveScope="full"
        onHeadingClick={jest.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[3]).toHaveAttribute('aria-current', 'true'); // 'After Include'
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'true')).toHaveLength(1);
  });
});

// T022: OutlineView scope toggle (feature 032 / US2 / FR-003 / FR-004)
describe('OutlineView — scope toggle (feature 032)', () => {
  const mixed: SectionOutlineEntry[] = [
    { level: 0, title: 'Root', line: 1, from: 0, sourceFileId: 'id-a', sourcePath: 'a.adoc', sourceLine: 1, isOpenFile: true },
    { level: 1, title: 'Open Heading', line: 3, from: 10, sourceFileId: 'id-a', sourcePath: 'a.adoc', sourceLine: 3, isOpenFile: true },
    { level: 1, title: 'Foreign Heading', line: 5, from: 50, sourceFileId: 'id-b', sourcePath: 'b.adoc', sourceLine: 1, isOpenFile: false },
  ];

  test('toggle button is present when outlineScope and onScopeChange are provided', () => {
    render(
      <OutlineView
        entries={mixed}
        currentLine={null}
        hasDocument
        effectiveScope="full"
        outlineScope="full"
        onHeadingClick={jest.fn()}
        onScopeChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /current file|full document/i })).toBeInTheDocument();
  });

  test('when outlineScope=current, only open-file entries are rendered', () => {
    render(
      <OutlineView
        entries={mixed}
        currentLine={null}
        hasDocument
        effectiveScope="current"
        outlineScope="current"
        onHeadingClick={jest.fn()}
        onScopeChange={jest.fn()}
      />,
    );
    expect(screen.queryByText('Foreign Heading')).toBeNull();
    expect(screen.getByText('Open Heading')).toBeInTheDocument();
  });

  test('when outlineScope=full, all entries including foreign-file are rendered', () => {
    render(
      <OutlineView
        entries={mixed}
        currentLine={null}
        hasDocument
        effectiveScope="full"
        outlineScope="full"
        onHeadingClick={jest.fn()}
        onScopeChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Foreign Heading')).toBeInTheDocument();
    expect(screen.getByText('Open Heading')).toBeInTheDocument();
  });

  test('clicking the toggle calls onScopeChange with the opposite scope', () => {
    const onScopeChange = jest.fn();
    render(
      <OutlineView
        entries={mixed}
        currentLine={null}
        hasDocument
        effectiveScope="full"
        outlineScope="full"
        onHeadingClick={jest.fn()}
        onScopeChange={onScopeChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /current file|full document/i }));
    expect(onScopeChange).toHaveBeenCalledWith('current');
  });

  test('no toggle button is rendered when onScopeChange is not provided', () => {
    render(
      <OutlineView
        entries={mixed}
        currentLine={null}
        hasDocument
        effectiveScope="full"
        onHeadingClick={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /current file|full document/i })).toBeNull();
  });

  // Task 2: the scope toggle is an icon button (matching the other header/rail icon buttons), not a
  // text label — but it keeps an accessible name so it stays keyboard- and screen-reader-usable.
  test('the scope toggle is an icon button with an accessible name and no visible text', () => {
    render(
      <OutlineView
        entries={mixed}
        currentLine={null}
        hasDocument
        effectiveScope="full"
        outlineScope="full"
        onHeadingClick={jest.fn()}
        onScopeChange={jest.fn()}
      />,
    );
    const toggle = screen.getByRole('button', { name: /current file|full document/i });
    // Icon-only: renders an SVG glyph and carries no visible text content.
    expect(toggle.querySelector('svg')).not.toBeNull();
    expect(toggle.textContent).toBe('');
  });
});

// T025: OutlineView — no-main-doc fallback (feature 032 / US3 / FR-005 / FR-006)
describe('OutlineView — no-main-doc fallback (feature 032)', () => {
  const openFileEntries: SectionOutlineEntry[] = [
    { level: 0, title: 'Standalone Title', line: 1, from: 0 },
    { level: 1, title: 'Only Section', line: 3, from: 20 },
  ];

  test('when outlineScope is absent, toggle button is hidden', () => {
    render(
      <OutlineView
        entries={openFileEntries}
        currentLine={null}
        hasDocument
        effectiveScope="current"
        onHeadingClick={jest.fn()}
      />,
    );
    // No scope props → toggle must not appear (FR-005/FR-006)
    expect(screen.queryByRole('button', { name: /current file|full document/i })).toBeNull();
  });

  test('when outlineScope is absent, still renders the open-file headings', () => {
    render(
      <OutlineView
        entries={openFileEntries}
        currentLine={null}
        hasDocument
        effectiveScope="current"
        onHeadingClick={jest.fn()}
      />,
    );
    expect(screen.getByText('Standalone Title')).toBeInTheDocument();
    expect(screen.getByText('Only Section')).toBeInTheDocument();
  });
});
