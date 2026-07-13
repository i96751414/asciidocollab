import { renderHook, act, waitFor } from '@testing-library/react';
import { useProjectRenderConfig } from '@/hooks/use-project-render-config';
import { renderConfigApi } from '@/lib/api/render-config';
import { ApiError } from '@/lib/api/transport';
import type { RenderConfig } from '@asciidocollab/shared';

jest.mock('@/lib/api/render-config', () => ({
  renderConfigApi: { get: jest.fn(), save: jest.fn() },
}));

const mockGet = renderConfigApi.get as jest.MockedFunction<typeof renderConfigApi.get>;
const mockSave = renderConfigApi.save as jest.MockedFunction<typeof renderConfigApi.save>;

describe('useProjectRenderConfig', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSave.mockReset();
  });

  it('loads the config on mount', async () => {
    mockGet.mockResolvedValue({ data: { doctype: 'book' } });
    const { result } = renderHook(() => useProjectRenderConfig('proj-1'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toEqual({ doctype: 'book' });
    expect(mockGet).toHaveBeenCalledWith('proj-1');
  });

  it('surfaces a load error message', async () => {
    mockGet.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    const { result } = renderHook(() => useProjectRenderConfig('proj-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
  });

  it('persists on save and adopts the returned config', async () => {
    mockGet.mockResolvedValue({ data: {} });
    mockSave.mockResolvedValue({ data: { media: 'print' } });
    const { result } = renderHook(() => useProjectRenderConfig('proj-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.save({ media: 'print' });
    });
    expect(ok).toBe(true);
    expect(mockSave).toHaveBeenCalledWith('proj-1', { media: 'print' });
    expect(result.current.config).toEqual({ media: 'print' });
  });

  it('reports a save failure without throwing', async () => {
    mockGet.mockResolvedValue({ data: {} });
    mockSave.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'nope'));
    const { result } = renderHook(() => useProjectRenderConfig('proj-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.save({ doctype: 'book' });
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('nope');
  });

  it('falls back to a generic message for a non-ApiError load failure', async () => {
    mockGet.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useProjectRenderConfig('proj-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load render configuration.');
  });

  it('falls back to a generic message for a non-ApiError save failure', async () => {
    mockGet.mockResolvedValue({ data: {} });
    mockSave.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useProjectRenderConfig('proj-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.save({ doctype: 'book' });
    });
    expect(result.current.error).toBe('Failed to save render configuration.');
  });

  it('ignores a resolved load after unmount (no state update)', async () => {
    let resolve!: (value: { data: RenderConfig }) => void;
    mockGet.mockReturnValue(
      new Promise<{ data: RenderConfig }>((resolveFunction) => {
        resolve = resolveFunction;
      }),
    );
    const { unmount } = renderHook(() => useProjectRenderConfig('proj-1'));
    unmount();
    await act(async () => {
      resolve({ data: { doctype: 'book' } });
    });
    expect(mockGet).toHaveBeenCalled();
  });

  it('ignores a rejected load after unmount (no state update)', async () => {
    let reject!: (reason: unknown) => void;
    mockGet.mockReturnValue(
      new Promise<{ data: RenderConfig }>((_resolve, rejectFunction) => {
        reject = rejectFunction;
      }),
    );
    const { unmount } = renderHook(() => useProjectRenderConfig('proj-1'));
    unmount();
    await act(async () => {
      reject(new ApiError(500, 'X', 'x'));
    });
    expect(mockGet).toHaveBeenCalled();
  });
});
