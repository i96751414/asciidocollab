import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ appTheme: 'system', userId: 'u1', displayName: 'Test', email: 'test@example.com', isAdmin: false, emailVerified: true, avatarKey: null }),
  });
});

describe('ThemeProvider', () => {
  test('renders children', () => {
    render(
      <ThemeProvider>
        <span data-testid="child">Hello</span>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  test('reads profile on mount to confirm DB value', async () => {
    render(
      <ThemeProvider>
        <span>content</span>
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/me'),
        expect.any(Object),
      );
    });
  });

  test('applies dark class when DB value is dark', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ appTheme: 'dark' }),
    });
    render(
      <ThemeProvider>
        <span>content</span>
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  test('removes the dark class when DB value is light', async () => {
    document.documentElement.classList.add('dark');
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ appTheme: 'light' }) });
    render(
      <ThemeProvider>
        <span>content</span>
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  test('falls back to the OS preference when no appTheme is stored', async () => {
    globalThis.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof matchMedia;
    document.documentElement.classList.remove('dark');
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    render(
      <ThemeProvider>
        <span>content</span>
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  test('ignores a non-ok response without throwing', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });
    render(
      <ThemeProvider>
        <span data-testid="child2">content</span>
      </ThemeProvider>,
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.getByTestId('child2')).toBeInTheDocument();
  });
});
