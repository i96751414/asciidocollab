import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SearchResultDto } from '@asciidocollab/shared';
import { SearchView } from '@/components/editor/search-view';
import { ProjectSearchApiError } from '@/lib/api/project-search';

const searchProjectContent = jest.fn();

jest.mock('@/lib/api/project-search', () => ({
  searchProjectContent: (...args: unknown[]) => searchProjectContent(...args),
  ProjectSearchApiError: class ProjectSearchApiError extends Error {
    constructor(public readonly status: number, public readonly code: string, message: string) {
      super(message);
      this.name = 'ProjectSearchApiError';
    }
  },
}));

const RESULT: SearchResultDto = {
  groups: [
    {
      fileNodeId: 'node-1',
      path: 'chapters/intro.adoc',
      matchCount: 1,
      matches: [{ ordinal: 0, line: 3, column: 5, from: 20, to: 23, lineText: 'the foo is here', matchText: 'foo' }],
    },
  ],
  totalMatches: 1,
  returnedMatches: 1,
  capped: false,
  skippedFiles: 0,
};

describe('SearchView', () => {
  beforeEach(() => searchProjectContent.mockReset());

  const type = (value: string) =>
    fireEvent.change(screen.getByLabelText('Search query'), { target: { value } });

  test('idle before any query', () => {
    render(<SearchView projectId="p1" onNavigate={jest.fn()} />);
    expect(screen.getByText(/type to search/i)).toBeInTheDocument();
  });

  test('shows grouped results and navigates on click', async () => {
    searchProjectContent.mockResolvedValue(RESULT);
    const onNavigate = jest.fn();
    render(<SearchView projectId="p1" onNavigate={onNavigate} />);
    type('foo');

    expect(await screen.findByText('chapters/intro.adoc')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /line 3: the foo is here/i }));
    expect(onNavigate).toHaveBeenCalledWith({ fileNodeId: 'node-1', path: 'chapters/intro.adoc', line: 3, from: 20, to: 23 });
  });

  test('explicit no-results state', async () => {
    searchProjectContent.mockResolvedValue({ groups: [], totalMatches: 0, returnedMatches: 0, capped: false, skippedFiles: 0 });
    render(<SearchView projectId="p1" onNavigate={jest.fn()} />);
    type('zzz');
    expect(await screen.findByText(/no matches found/i)).toBeInTheDocument();
  });

  test('renders an inline error for an invalid regex', async () => {
    searchProjectContent.mockRejectedValue(new ProjectSearchApiError(400, 'INVALID_PATTERN', 'unbalanced parenthesis'));
    render(<SearchView projectId="p1" onNavigate={jest.fn()} />);
    // Turn on regex mode and enter a pattern.
    fireEvent.click(screen.getByRole('button', { name: /regular expression/i }));
    type('(bad');
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid pattern/i);
  });

  test('surfaces the capped affordance and skipped-file count', async () => {
    searchProjectContent.mockResolvedValue({ ...RESULT, totalMatches: 5000, returnedMatches: 1, capped: true, skippedFiles: 2 });
    render(<SearchView projectId="p1" onNavigate={jest.fn()} />);
    type('foo');
    expect(await screen.findByText(/showing 1 of 5000 matches/i)).toBeInTheDocument();
    expect(screen.getByText(/2 files skipped/i)).toBeInTheDocument();
  });
});
