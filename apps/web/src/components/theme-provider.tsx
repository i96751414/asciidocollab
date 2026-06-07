'use client';

import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api/file-content';

interface ThemeProviderProperties {
  /** React subtree to render. */
  children: React.ReactNode;
}

interface MeResponse {
  /** 'light' | 'dark' | 'system' — falls back to 'system' when absent. */
  appTheme?: string;
}

/** Loads the authenticated user's theme preference on mount and applies it to the HTML root element. */
export function ThemeProvider({ children }: ThemeProviderProperties) {
  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data: MeResponse) => {
        const theme = data.appTheme ?? 'system';
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else if (theme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          const prefersDark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.classList.toggle('dark', prefersDark);
        }
      })
      .catch(() => {});
  }, []);

  return <>{children}</>;
}
