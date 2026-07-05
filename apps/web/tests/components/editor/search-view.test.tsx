import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { SearchResultDto } from '@asciidocollab/shared';
import { SearchView } from '@/components/editor/search-view';
import { ProjectSearchApiError } from '@/lib/api/project-search';

const searchProjectContent = jest.fn();
const replaceProjectContent = jest.fn();

jest.mock('@/lib/api/project-search', () => ({
  searchProjectContent: (...arguments_: unknown[]) => searchProjectContent(...arguments_),
  replaceProjectContent: (...arguments_: unknown[]) => replaceProjectContent(...arguments_),
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

const TWO_MATCH_RESULT: SearchResultDto = {
  groups: [
    {
      fileNodeId: 'node-1',
      path: 'a.adoc',
      matchCount: 2,
      matches: [
        { ordinal: 0, line: 1, column: 1, from: 0, to: 3, lineText: 'foo one', matchText: 'foo' },
        { ordinal: 1, line: 2, column: 1, from: 8, to: 11, lineText: 'foo two', matchText: 'foo' },
      ],
    },
  ],
  totalMatches: 2,
  returnedMatches: 2,
  capped: false,
  skippedFiles: 0,
};

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText('Search query'), { target: { value } });

const typeReplacement = (value: string) =>
  fireEvent.change(screen.getByLabelText('Replacement text'), { target: { value } });

describe('SearchView', () => {
  beforeEach(() => {
    searchProjectContent.mockReset();
    replaceProjectContent.mockReset();
    replaceProjectContent.mockResolvedValue({ replacedCount: 1, affectedFiles: 1, skipped: [] });
  });

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

  test('replace-all confirms scope then sends every included match', async () => {
    searchProjectContent.mockResolvedValue(TWO_MATCH_RESULT);
    render(<SearchView projectId="p1" onNavigate={jest.fn()} />);
    type('foo');
    await screen.findByText('a.adoc');
    typeReplacement('bar');

    fireEvent.click(screen.getByRole('button', { name: /replace all matches/i }));
    // Confirmation shows the match + file counts.
    const dialog = await screen.findByRole('dialog', { name: /confirm replace all/i });
    expect(dialog).toHaveTextContent(/replace.*2.*matches.*across.*1.*file/i);

    fireEvent.click(within(dialog).getByRole('button', { name: /replace all/i }));
    await waitFor(() => expect(replaceProjectContent).toHaveBeenCalled());
    const [, request] = replaceProjectContent.mock.calls[0];
    expect(request).toMatchObject({
      replacement: 'bar',
      scope: 'project',
      files: [{ fileNodeId: 'node-1', selections: [{ ordinal: 0, expectedText: 'foo' }, { ordinal: 1, expectedText: 'foo' }] }],
    });
  });

  test('excluding a match omits it from the replace request', async () => {
    searchProjectContent.mockResolvedValue(TWO_MATCH_RESULT);
    render(<SearchView projectId="p1" onNavigate={jest.fn()} />);
    type('foo');
    await screen.findByText('a.adoc');
    typeReplacement('bar');

    // Uncheck the first match (exclude it).
    fireEvent.click(screen.getByRole('checkbox', { name: /exclude match on line 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /replace all matches/i }));
    const dialog = await screen.findByRole('dialog', { name: /confirm replace all/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /replace all/i }));

    await waitFor(() => expect(replaceProjectContent).toHaveBeenCalled());
    const [, request] = replaceProjectContent.mock.calls[0];
    expect(request.files[0].selections).toEqual([{ ordinal: 1, expectedText: 'foo' }]);
  });

  test('re-searches after a successful replace so resolved matches disappear', async () => {
    searchProjectContent.mockResolvedValue(TWO_MATCH_RESULT);
    render(<SearchView projectId="p1" onNavigate={jest.fn()} />);
    type('foo');
    await screen.findByText('a.adoc');
    typeReplacement('bar');
    expect(searchProjectContent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /replace all matches/i }));
    const dialog = await screen.findByRole('dialog', { name: /confirm replace all/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /replace all/i }));

    // The hook refreshes → a second search fires for the same query.
    await waitFor(() => expect(searchProjectContent).toHaveBeenCalledTimes(2));
  });
});
