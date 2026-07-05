/* @jest-environment jsdom */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProjectSearch } from '@/hooks/use-project-search';

const searchProjectContent = jest.fn();

jest.mock('@/lib/api/project-search', () => ({
  searchProjectContent: (...arguments_: unknown[]) => searchProjectContent(...arguments_),
  ProjectSearchApiError: class extends Error {
    constructor(public readonly status: number, public readonly code: string, message: string) {
      super(message);
    }
  },
}));

const emptyResult = { groups: [], totalMatches: 0, returnedMatches: 0, capped: false, skippedFiles: 0 };

describe('useProjectSearch', () => {
  beforeEach(() => searchProjectContent.mockReset());

  it('is idle with an empty query and never calls the API', async () => {
    const { result } = renderHook(() => useProjectSearch('p1'));
    expect(result.current.status).toBe('idle');
    await act(async () => { await Promise.resolve(); });
    expect(searchProjectContent).not.toHaveBeenCalled();
  });

  it('clears match exclusions when the query changes (stale ordinals must not carry over)', async () => {
    searchProjectContent.mockResolvedValue(emptyResult);
    const { result } = renderHook(() => useProjectSearch('p1'));
    act(() => result.current.setQuery({ query: 'foo' }));
    act(() => result.current.toggleExcluded('file-1', 3));
    expect(result.current.isExcluded('file-1', 3)).toBe(true);

    act(() => result.current.setQuery({ query: 'bar' }));
    // The new query renumbers matches, so file-1:3 must no longer be excluded.
    await waitFor(() => expect(result.current.isExcluded('file-1', 3)).toBe(false));
  });

  it('runs a debounced search and passes an abort signal', async () => {
    searchProjectContent.mockResolvedValue(emptyResult);
    const { result } = renderHook(() => useProjectSearch('p1'));
    act(() => result.current.setQuery({ query: 'foo' }));

    await waitFor(() => expect(searchProjectContent).toHaveBeenCalled());
    const [projectId, dto, signal] = searchProjectContent.mock.calls[0];
    expect(projectId).toBe('p1');
    expect(dto).toMatchObject({ query: 'foo', mode: 'literal' });
    expect(signal).toBeInstanceOf(AbortSignal);
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('coalesces rapid edits, firing a single request for the latest query', async () => {
    searchProjectContent.mockResolvedValue(emptyResult);
    const { result } = renderHook(() => useProjectSearch('p1'));
    act(() => result.current.setQuery({ query: 'a' }));
    act(() => result.current.setQuery({ query: 'ab' }));
    act(() => result.current.setQuery({ query: 'abc' }));

    await waitFor(() => expect(searchProjectContent).toHaveBeenCalledTimes(1));
    expect(searchProjectContent.mock.calls[0][1]).toMatchObject({ query: 'abc' });
  });
});
