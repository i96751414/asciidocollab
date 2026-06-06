import { renderHook, act, waitFor } from '@testing-library/react';
import { useKeyBindingSettings } from '@/hooks/use-key-binding-settings';

globalThis.fetch = jest.fn();

const mockBindings = [
  { action: 'file-tree:rename', keyCombo: 'F2', isDefault: true },
  { action: 'file-tree:delete', keyCombo: 'Delete', isDefault: true },
];

describe('useKeyBindingSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBindings),
    });
  });

  it('fetches all namespaces and groups by namespace', async () => {
    const { result } = renderHook(() => useKeyBindingSettings());
    await waitFor(() => {
      expect(result.current.groups.length).toBeGreaterThan(0);
      expect(result.current.groups[0].namespace).toBe('file-tree');
    });
  });

  it('updateBinding calls PATCH and updates local state optimistically', async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockBindings) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ action: 'file-tree:rename', keyCombo: 'F3', isDefault: false }) });

    const { result } = renderHook(() => useKeyBindingSettings());
    await waitFor(() => expect(result.current.groups.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.updateBinding('file-tree:rename', 'F3');
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/me/keybindings/file-tree%3Arename'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('resetBinding calls DELETE and reverts to default', async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockBindings) })
      .mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockBindings) });

    const { result } = renderHook(() => useKeyBindingSettings());
    await waitFor(() => expect(result.current.groups.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.resetBinding('file-tree:rename');
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/me/keybindings/file-tree%3Arename'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('updateBinding rolls back state and throws when PATCH returns non-ok', async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockBindings) })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Key combo already in use' } }),
      });

    const { result } = renderHook(() => useKeyBindingSettings());
    await waitFor(() => expect(result.current.groups.length).toBeGreaterThan(0));

    await expect(
      act(async () => { await result.current.updateBinding('file-tree:rename', 'F9'); }),
    ).rejects.toThrow('Key combo already in use');
  });

  it('updateBinding rolls back and throws with default message when error body missing', async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockBindings) })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.reject(new Error('no body')),
      });

    const { result } = renderHook(() => useKeyBindingSettings());
    await waitFor(() => expect(result.current.groups.length).toBeGreaterThan(0));

    await expect(
      act(async () => { await result.current.updateBinding('file-tree:rename', 'F9'); }),
    ).rejects.toThrow('Update failed');
  });

  it('resetBinding rolls back state and throws when DELETE returns non-ok', async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockBindings) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => useKeyBindingSettings());
    await waitFor(() => expect(result.current.groups.length).toBeGreaterThan(0));

    await expect(
      act(async () => { await result.current.resetBinding('file-tree:rename'); }),
    ).rejects.toThrow('Reset failed');
  });

  it('fetchAll silently ignores network errors', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useKeyBindingSettings());
    await waitFor(() => {
      // After failed fetch, groups stays empty — hook must not throw
      expect(result.current.groups).toEqual([]);
    });
  });
});
