import { renderHook, act, waitFor } from '@testing-library/react';
import { useTheme } from '@/hooks/use-theme';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

const mockMatchMedia = jest.fn().mockReturnValue({
  matches: false,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
});
Object.defineProperty(globalThis, 'matchMedia', { value: mockMatchMedia, writable: true });

const mockDocumentClassList = { add: jest.fn(), remove: jest.fn(), contains: jest.fn(), toggle: jest.fn() };
Object.defineProperty(document, 'documentElement', {
  value: { classList: mockDocumentClassList },
  writable: true,
  configurable: true,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ appTheme: 'system', userId: 'u1', displayName: 'Test', email: 'test@example.com', isAdmin: false, emailVerified: true, avatarKey: null }),
  });
  Object.defineProperty(document, 'cookie', { value: '', writable: true });
});

describe('useTheme', () => {
  test('loads DB value from profile API on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ appTheme: 'dark', userId: 'u1', displayName: 'Test', email: 'test@example.com', isAdmin: false, emailVerified: true, avatarKey: null }),
    });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('dark'));
  });

  test('setTheme calls PATCH /auth/me/profile and writes cookie', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('system'));
    await act(async () => {
      await result.current.setTheme('dark');
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me/profile'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ appTheme: 'dark' }) }),
    );
  });

  test('falls back to OS preference when unauthenticated', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockMatchMedia.mockReturnValueOnce({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.resolvedTheme).toBe('dark'));
  });

  test('resolvedTheme is "dark" when theme is "dark"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ appTheme: 'dark', userId: 'u1', displayName: 'Test', email: 'test@example.com', isAdmin: false, emailVerified: true, avatarKey: null }),
    });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.resolvedTheme).toBe('dark'));
  });

  test('resolvedTheme is "light" when theme is "light"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ appTheme: 'light', userId: 'u1', displayName: 'Test', email: 'test@example.com', isAdmin: false, emailVerified: true, avatarKey: null }),
    });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.resolvedTheme).toBe('light'));
  });
});
