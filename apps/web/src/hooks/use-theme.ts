'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api/file-content';
const COOKIE_NAME = 'asciidocollab-theme';

/** Application colour theme selection. */
export type Theme = 'light' | 'dark' | 'system';

/** Return type of the `useTheme` hook. */
export interface UseThemeResult {
  /** The stored preference: 'light', 'dark', or 'system'. */
  theme: Theme;
  /** The effective (resolved) theme, never 'system'. */
  resolvedTheme: 'light' | 'dark';
  /**
   * Persists the new theme preference to the server and applies it immediately.
   *
   * @param theme - The theme value to activate.
   */
  setTheme: (theme: Theme) => Promise<void>;
}

interface MeResponse {
  /** Stored theme preference for the authenticated user. */
  appTheme?: string;
}

function resolveOsPreference(): 'light' | 'dark' {
  if (globalThis.window !== undefined && globalThis.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function applyThemeClass(resolved: 'light' | 'dark'): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }
}

function writeCookie(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE_NAME}=${theme};path=/;max-age=31536000;samesite=lax`;
  }
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return resolveOsPreference();
  return theme;
}

/**
 * Reads and persists the user's colour-theme preference; applies the theme class to the document root.
 *
 * @param initialTheme - Stored preference already known to the caller, typically from the
 *   server-loaded profile; when provided it seeds state and skips the redundant `/auth/me` fetch.
 */
export function useTheme(initialTheme?: Theme): UseThemeResult {
  const [theme, setThemeState] = useState<Theme>(initialTheme ?? 'system');

  useEffect(() => {
    // The preference is already known from the server profile — apply it and skip the fetch.
    if (initialTheme !== undefined) {
      applyThemeClass(resolveTheme(initialTheme));
      return;
    }
    fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data: MeResponse) => {
        const rawTheme = data.appTheme ?? 'system';
        const loaded: Theme = rawTheme === 'light' || rawTheme === 'dark' ? rawTheme : 'system';
        setThemeState(loaded);
        applyThemeClass(resolveTheme(loaded));
      })
      .catch(() => {
        const resolved = resolveOsPreference();
        applyThemeClass(resolved);
      });
  }, [initialTheme]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    const resolved = resolveTheme(newTheme);
    applyThemeClass(resolved);
    writeCookie(newTheme);
    await fetch(`${API_BASE_URL}/auth/me/profile`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appTheme: newTheme }),
    });
  }, []);

  return { theme, resolvedTheme: resolveTheme(theme), setTheme };
}
