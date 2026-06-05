import { useState, useEffect, useCallback, useRef } from 'react';

/** Valid editor theme values. */
export type EditorThemeValue = 'default' | 'high-contrast';

const LS_KEY = 'asciidocollab:editor-preferences';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const DEBOUNCE_MS = 500;

interface EditorPrefs {
  fontSize: number;
  theme: EditorThemeValue;
}

const DEFAULT_PREFS: EditorPrefs = { fontSize: 14, theme: 'default' };

function isStoredPrefs(value: unknown): value is { fontSize?: number; theme?: string } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadFromStorage(): EditorPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isStoredPrefs(parsed)) {
        return {
          fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : DEFAULT_PREFS.fontSize,
          theme: (parsed.theme === 'default' || parsed.theme === 'high-contrast') ? parsed.theme : DEFAULT_PREFS.theme,
        };
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_PREFS;
}

/** Result interface for useEditorPreferences hook. */
interface UseEditorPreferencesResult {
  fontSize: number;
  theme: EditorThemeValue;
  setFontSize: (size: number) => void;
  setTheme: (theme: EditorThemeValue) => void;
}

/** Manages editor font size and theme, persisting to localStorage and API. */
export function useEditorPreferences(): UseEditorPreferencesResult {
  const [prefs, setPrefs] = useState<EditorPrefs>(loadFromStorage);
  // Use a ref for the debounce timer so timer changes don't trigger re-renders
  // and the callbacks always see the latest timer ID without stale-closure issues.
  const debounceTimerReference = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetch(`${API_BASE}/auth/me/editor-preferences`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data: EditorPrefs) => setPrefs(data))
      .catch(() => { /* keep localStorage value on error */ });
  }, []);

  function schedulePut(next: EditorPrefs) {
    if (debounceTimerReference.current) clearTimeout(debounceTimerReference.current);
    debounceTimerReference.current = setTimeout(() => {
      void fetch(`${API_BASE}/auth/me/editor-preferences`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    }, DEBOUNCE_MS);
  }

  const setFontSize = useCallback((fontSize: number) => {
    setPrefs((previous) => {
      const next = { ...previous, fontSize };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      schedulePut(next);
      return next;
    });
  }, []);

  const setTheme = useCallback((theme: EditorThemeValue) => {
    setPrefs((previous) => {
      const next = { ...previous, theme };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      schedulePut(next);
      return next;
    });
  }, []);

  return { fontSize: prefs.fontSize, theme: prefs.theme, setFontSize, setTheme };
}
