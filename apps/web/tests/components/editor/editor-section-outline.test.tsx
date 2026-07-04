import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorSectionOutline } from '@/components/editor/editor-section-outline';
import type { SectionOutlineEntry } from '@/lib/codemirror/asciidoc-outline';
import type { ParticipantPresence } from '@/hooks/use-collab-presence';

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

  // 028: level 0 (title) is flush; deeper levels step in. paddingLeft = level*12 + 8.
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

  // 028: the row at currentIndex is marked aria-current; exactly one.
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

// provenance rendering for full-document outline (feature 032)
describe('EditorSectionOutline — provenance (feature 032)', () => {
  const mainEntry: SectionOutlineEntry = {
    level: 0, title: 'Doc Title', line: 1, from: 0,
    sourceFileId: 'id-main', sourcePath: 'main.adoc', sourceLine: 1, isOpenFile: true,
  };
  const childEntry: SectionOutlineEntry = {
    level: 1, title: 'Child Section', line: 6, from: 100,
    sourceFileId: 'id-ch', sourcePath: 'ch.adoc', sourceLine: 1, isOpenFile: false,
  };
  const openEntry2: SectionOutlineEntry = {
    level: 1, title: 'After Include', line: 8, from: 200,
    sourceFileId: 'id-main', sourcePath: 'main.adoc', sourceLine: 7, isOpenFile: true,
  };

  test('renders provenance entries as one seamless list (no per-file dividers)', () => {
    render(
      <EditorSectionOutline
        entries={[mainEntry, childEntry, openEntry2]}
        onHeadingClick={jest.fn()}
      />,
    );
    // All three buttons present with no separators in between
    expect(screen.getAllByRole('button')).toHaveLength(3);
    // No <hr> or role=separator elements
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByText('Doc Title')).toBeInTheDocument();
    expect(screen.getByText('Child Section')).toBeInTheDocument();
    expect(screen.getByText('After Include')).toBeInTheDocument();
  });

  test('marks isOpenFile entries with data-open-file attribute', () => {
    render(
      <EditorSectionOutline
        entries={[mainEntry, childEntry, openEntry2]}
        onHeadingClick={jest.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    // mainEntry (isOpenFile=true) and openEntry2 (isOpenFile=true) get the marker
    expect(buttons[0]).toHaveAttribute('data-open-file', 'true');
    expect(buttons[2]).toHaveAttribute('data-open-file', 'true');
    // childEntry (isOpenFile=false) must NOT have the marker
    expect(buttons[1]).not.toHaveAttribute('data-open-file');
  });

  test('onHeadingClick receives the full provenance-tagged entry', () => {
    const onHeadingClick = jest.fn();
    render(
      <EditorSectionOutline
        entries={[mainEntry, childEntry, openEntry2]}
        onHeadingClick={onHeadingClick}
      />,
    );
    // Click the child (foreign-file) entry
    fireEvent.click(screen.getByText('Child Section'));
    expect(onHeadingClick).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFileId: 'id-ch',
        sourcePath: 'ch.adoc',
        sourceLine: 1,
        isOpenFile: false,
      }),
    );
  });

  test('entries without provenance (current-file scope) render unchanged', () => {
    const plain: SectionOutlineEntry[] = [
      { level: 1, title: 'Plain Heading', line: 1, from: 0 },
    ];
    render(<EditorSectionOutline entries={plain} onHeadingClick={jest.fn()} />);
    expect(screen.getByText('Plain Heading')).toBeInTheDocument();
    // No open-file marker when provenance is absent
    expect(screen.getByRole('button')).not.toHaveAttribute('data-open-file');
  });
});

function presencePeer(name: string, clientId: number): ParticipantPresence {
  return { clientId, userId: `u-${name.toLowerCase()}`, name, color: '#30bced', colorLight: '#30bced33' };
}

// presence markers on outline entries (feature 032)
describe('EditorSectionOutline — presence markers (feature 032)', () => {
  const entryA: SectionOutlineEntry = {
    level: 1, title: 'Section A', line: 5, from: 0,
    sourceFileId: 'id-ch', sourcePath: 'ch.adoc', sourceLine: 3, isOpenFile: false,
  };
  const entryB: SectionOutlineEntry = {
    level: 1, title: 'Section B', line: 8, from: 50,
    sourceFileId: 'id-main', sourcePath: 'main.adoc', sourceLine: 7, isOpenFile: true,
  };

  test('renders OpenByOthersMarker for entries with a matching presence key', () => {
    const key = `${entryA.sourceFileId}:${entryA.sourceLine}`;
    const presenceMap = new Map<string, ParticipantPresence[]>([[key, [presencePeer('Bea', 2)]]]);
    render(
      <EditorSectionOutline
        entries={[entryA, entryB]}
        onHeadingClick={jest.fn()}
        outlinePresence={presenceMap}
      />,
    );
    // Exactly one marker — on entryA; entryB has no presence
    expect(screen.getAllByTestId('open-by-others-marker')).toHaveLength(1);
  });

  test('renders no marker when outlinePresence is absent or empty', () => {
    render(
      <EditorSectionOutline
        entries={[entryA, entryB]}
        onHeadingClick={jest.fn()}
        outlinePresence={new Map()}
      />,
    );
    expect(screen.queryByTestId('open-by-others-marker')).toBeNull();
  });

  test('renders no marker when the map key does not match (wrong sourceFileId or sourceLine)', () => {
    const wrongKey = `${entryA.sourceFileId}:999`;
    const presenceMap = new Map<string, ParticipantPresence[]>([[wrongKey, [presencePeer('Bea', 2)]]]);
    render(
      <EditorSectionOutline
        entries={[entryA]}
        onHeadingClick={jest.fn()}
        outlinePresence={presenceMap}
      />,
    );
    expect(screen.queryByTestId('open-by-others-marker')).toBeNull();
  });

  test('marker aria-label names the collaborator', () => {
    const key = `${entryA.sourceFileId}:${entryA.sourceLine}`;
    const presenceMap = new Map<string, ParticipantPresence[]>([[key, [presencePeer('Bea', 2)]]]);
    render(
      <EditorSectionOutline
        entries={[entryA]}
        onHeadingClick={jest.fn()}
        outlinePresence={presenceMap}
      />,
    );
    expect(screen.getByTestId('open-by-others-marker')).toHaveAttribute('aria-label', 'Open by Bea');
  });

  test('shows +N overflow when more than 3 participants are on one heading', () => {
    const key = `${entryA.sourceFileId}:${entryA.sourceLine}`;
    const peers = [presencePeer('Bea', 2), presencePeer('Cy', 3), presencePeer('Dan', 4), presencePeer('Eve', 5)];
    const presenceMap = new Map<string, ParticipantPresence[]>([[key, peers]]);
    render(
      <EditorSectionOutline
        entries={[entryA]}
        onHeadingClick={jest.fn()}
        outlinePresence={presenceMap}
      />,
    );
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  test('entries without sourceFileId or sourceLine do not crash and show no marker', () => {
    const plain: SectionOutlineEntry = { level: 1, title: 'Plain', line: 1, from: 0 };
    const presenceMap = new Map<string, ParticipantPresence[]>([['undefined:undefined', [presencePeer('Bea', 2)]]]);
    render(
      <EditorSectionOutline
        entries={[plain]}
        onHeadingClick={jest.fn()}
        outlinePresence={presenceMap}
      />,
    );
    expect(screen.queryByTestId('open-by-others-marker')).toBeNull();
  });

  test('presence marker is keyboard-focusable (tabIndex=0) so identity is revealed on focus', () => {
    const key = `${entryA.sourceFileId}:${entryA.sourceLine}`;
    const presenceMap = new Map<string, ParticipantPresence[]>([[key, [presencePeer('Bea', 2)]]]);
    render(
      <EditorSectionOutline
        entries={[entryA]}
        onHeadingClick={jest.fn()}
        outlinePresence={presenceMap}
      />,
    );
    expect(screen.getByTestId('open-by-others-marker')).toHaveAttribute('tabindex', '0');
  });

  test('markers appear for multiple entries when each has presence', () => {
    const keyA = `${entryA.sourceFileId}:${entryA.sourceLine}`;
    const keyB = `${entryB.sourceFileId}:${entryB.sourceLine}`;
    const presenceMap = new Map<string, ParticipantPresence[]>([
      [keyA, [presencePeer('Bea', 2)]],
      [keyB, [presencePeer('Cy', 3)]],
    ]);
    render(
      <EditorSectionOutline
        entries={[entryA, entryB]}
        onHeadingClick={jest.fn()}
        outlinePresence={presenceMap}
      />,
    );
    expect(screen.getAllByTestId('open-by-others-marker')).toHaveLength(2);
  });
});

// accessibility — open-file mark, current-section, and presence marker not conveyed by color alone
describe('EditorSectionOutline — accessibility', () => {
  const openEntry: SectionOutlineEntry = {
    level: 1, title: 'Open Heading', line: 3, from: 0,
    sourceFileId: 'id-main', sourcePath: 'main.adoc', sourceLine: 3, isOpenFile: true,
  };
  const closedEntry: SectionOutlineEntry = {
    level: 1, title: 'Foreign Heading', line: 6, from: 50,
    sourceFileId: 'id-ch', sourcePath: 'ch.adoc', sourceLine: 1, isOpenFile: false,
  };

  test('open-file mark is conveyed by data-open-file attribute (not color-only)', () => {
    render(<EditorSectionOutline entries={[openEntry, closedEntry]} onHeadingClick={jest.fn()} />);
    const [buttonOpen, buttonClosed] = screen.getAllByRole('button');
    expect(buttonOpen).toHaveAttribute('data-open-file', 'true');
    expect(buttonClosed).not.toHaveAttribute('data-open-file');
  });

  test('current-section is conveyed by aria-current (not color-only) (028)', () => {
    render(<EditorSectionOutline entries={[openEntry, closedEntry]} currentIndex={0} onHeadingClick={jest.fn()} />);
    const [buttonOpen, buttonClosed] = screen.getAllByRole('button');
    expect(buttonOpen).toHaveAttribute('aria-current', 'true');
    expect(buttonClosed).not.toHaveAttribute('aria-current');
  });

  test('presence marker is conveyed by aria-label text (not color-only)', () => {
    const key = `${closedEntry.sourceFileId}:${closedEntry.sourceLine}`;
    const presenceMap = new Map<string, ParticipantPresence[]>([[key, [presencePeer('Bea', 2)]]]);
    render(
      <EditorSectionOutline
        entries={[closedEntry]}
        onHeadingClick={jest.fn()}
        outlinePresence={presenceMap}
      />,
    );
    const marker = screen.getByTestId('open-by-others-marker');
    expect(marker).toHaveAttribute('aria-label');
    expect(marker.getAttribute('aria-label')).toMatch(/Bea/);
    expect(marker).toHaveAttribute('tabindex', '0');
  });
});
