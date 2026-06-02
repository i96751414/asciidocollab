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
});
