import { renderHook, waitFor } from '@testing-library/react';
import { useIncludeCompletions } from '@/hooks/use-include-completions';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

const mockSSEListeners: Record<string, (() => void)[]> = {};
const mockEventSource = {
  addEventListener: jest.fn((event: string, function_: () => void) => {
    mockSSEListeners[event] = mockSSEListeners[event] ?? [];
    mockSSEListeners[event].push(function_);
  }),
  removeEventListener: jest.fn(),
  close: jest.fn(),
};
globalThis.EventSource = jest.fn(() => mockEventSource) as unknown as typeof EventSource;

function treeResponse(paths: string[]) {
  return { ok: true, json: () => Promise.resolve(pathsToTree(paths)) };
}

function pathsToTree(paths: string[]) {
  return {
    id: 'root',
    name: 'root',
    type: 'folder',
    path: '/',
    parentId: null,
    children: paths.map((filePath) => ({
      id: filePath,
      name: filePath.split('/').pop(),
      type: 'file',
      path: `/${filePath}`,
      parentId: 'root',
      children: [],
    })),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(treeResponse([]));
  for (const key of Object.keys(mockSSEListeners)) { delete mockSSEListeners[key]; }
});

// Issue 5: useIncludeCompletions fetches the file-tree endpoint, so it must import
// API_BASE_URL from the file-tree module (its natural home), not file-content.
describe('useIncludeCompletions module imports', () => {
  test('use-include-completions.ts imports API_BASE_URL from lib/api/file-tree, not file-content', () => {
    const fs = require('node:fs');
    const source: string = fs.readFileSync(
      require.resolve('@/hooks/use-include-completions'),
      'utf8',
    );
    expect(source).not.toContain("from '@/lib/api/file-content'");
    expect(source).toContain("from '@/lib/api/file-tree'");
  });
});

describe('useIncludeCompletions', () => {
  // Issue 1: hook must fetch GET /projects/:projectId/files (no /api/ prefix, /files not /tree)
  test('fetches GET /projects/:projectId/files with no /api/ prefix', async () => {
    mockFetch.mockResolvedValue(treeResponse(['chapters/intro.adoc']));
    renderHook(() => useIncludeCompletions('proj-1'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url] = mockFetch.mock.calls[0] as [string, unknown];
    expect(url).not.toContain('/api/');
    expect(url).toContain('/projects/proj-1/files');
  });

  test('flattens nested tree to a list of relative file paths', async () => {
    mockFetch.mockResolvedValue(treeResponse(['chapters/intro.adoc', 'images/logo.png']));
    const { result } = renderHook(() => useIncludeCompletions('proj-1'));

    await waitFor(() => {
      expect(result.current).toContain('chapters/intro.adoc');
      expect(result.current).toContain('images/logo.png');
    });
  });

  test('returns empty array before fetch completes', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useIncludeCompletions('proj-1'));
    expect(result.current).toEqual([]);
  });
});
