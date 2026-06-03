import { renderHook, waitFor } from '@testing-library/react';
import { useKeyBindings } from '@/hooks/use-key-bindings';

globalThis.fetch = jest.fn();

const mockBindings = [
  { action: 'file-tree:rename', keyCombo: 'F2', isDefault: true },
  { action: 'file-tree:delete', keyCombo: 'Delete', isDefault: true },
  { action: 'file-tree:new-file', keyCombo: 'Ctrl+N', isDefault: true },
  { action: 'file-tree:new-folder', keyCombo: 'Ctrl+Shift+N', isDefault: true },
];

describe('useKeyBindings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBindings),
    });
  });

  it('fetches GET /users/me/keybindings?namespace=file-tree on mount', async () => {
    renderHook(() => useKeyBindings('file-tree'));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me/keybindings?namespace=file-tree'),
        expect.any(Object),
      );
    });
  });

  it('returns correct Map<action, keyCombo>', async () => {
    const { result } = renderHook(() => useKeyBindings('file-tree'));
    await waitFor(() => expect(result.current.get('file-tree:rename')).toBe('F2'));
    expect(result.current.get('file-tree:delete')).toBe('Delete');
  });

  it('re-fetches when namespace changes', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockClear();

    const { rerender } = renderHook(({ ns }: { ns: string }) => useKeyBindings(ns), {
      initialProps: { ns: 'file-tree' },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const firstCallCount = fetchMock.mock.calls.length;

    rerender({ ns: 'other' });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(firstCallCount));
  });
});
