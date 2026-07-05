import React from 'react';
import { render, screen } from '@testing-library/react';
import { LeftPanel } from '@/components/editor/left-panel';

function renderPanel(activeTab: 'files' | 'outline' | 'search') {
  return render(
    <LeftPanel
      activeTab={activeTab}
      onTabChange={jest.fn()}
      filesSlot={<div data-testid="files-slot">FILES CONTENT</div>}
      outlineSlot={<div data-testid="outline-slot">OUTLINE CONTENT</div>}
      searchSlot={<div data-testid="search-slot">SEARCH CONTENT</div>}
    />,
  );
}

describe('LeftPanel', () => {
  test('renders the rail and a body with the aria-controls id', () => {
    renderPanel('files');
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(document.querySelector('#left-panel-body')).not.toBeNull();
  });

  test('does not render its own title row — each view owns its header (no duplicate title)', () => {
    renderPanel('files');
    // The panel shell renders neither "FILES" nor "OUTLINE"; titles live in the slots' own headers.
    expect(screen.queryByText('FILES')).not.toBeInTheDocument();
    expect(screen.queryByText('OUTLINE')).not.toBeInTheDocument();
  });

  test('keeps ALL slots mounted; the inactive ones are hidden', () => {
    renderPanel('files');
    const files = screen.getByTestId('files-slot');
    const outline = screen.getByTestId('outline-slot');
    const search = screen.getByTestId('search-slot');
    // All present in the DOM (never unmounted) so the file tree + editor/preview never re-initialize.
    expect(files).toBeInTheDocument();
    expect(outline).toBeInTheDocument();
    expect(search).toBeInTheDocument();
    // The inactive (outline + search) slots are hidden via the `hidden` class on their wrappers.
    expect(outline.closest('[hidden], .hidden')).not.toBeNull();
    expect(search.closest('[hidden], .hidden')).not.toBeNull();
    expect(files.closest('[hidden], .hidden')).toBeNull();
  });

  test('activating the search tab reveals the search slot only', () => {
    renderPanel('search');
    expect(screen.getByTestId('search-slot').closest('[hidden], .hidden')).toBeNull();
    expect(screen.getByTestId('files-slot').closest('[hidden], .hidden')).not.toBeNull();
    expect(screen.getByTestId('outline-slot').closest('[hidden], .hidden')).not.toBeNull();
  });

  test('toggling activeTab flips visibility without unmounting either slot', () => {
    const { rerender } = renderPanel('files');
    const filesBefore = screen.getByTestId('files-slot');
    rerender(
      <LeftPanel
        activeTab="outline"
        onTabChange={jest.fn()}
        filesSlot={<div data-testid="files-slot">FILES CONTENT</div>}
        outlineSlot={<div data-testid="outline-slot">OUTLINE CONTENT</div>}
        searchSlot={<div data-testid="search-slot">SEARCH CONTENT</div>}
      />,
    );
    // Same DOM node identity for the files slot proves it was not unmounted.
    expect(screen.getByTestId('files-slot')).toBe(filesBefore);
    expect(screen.getByTestId('files-slot').closest('[hidden], .hidden')).not.toBeNull();
    expect(screen.getByTestId('outline-slot').closest('[hidden], .hidden')).toBeNull();
  });
});
