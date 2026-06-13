import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api/file-content';
import { isPreviewStyleValue, type PreviewStyleValue } from '@/components/preview-style-control';

// Re-exported so consumers/tests that read preferences can validate tokens from one import.
export { isPreviewStyleValue } from '@/components/preview-style-control';
export type { PreviewStyleValue } from '@/components/preview-style-control';

/** Valid editor theme values. */
export type EditorThemeValue = 'default' | 'high-contrast' | 'dracula' | 'tomorrow' | 'espresso';

const VALID_THEMES: readonly string[] = [
  'default',
  'high-contrast',
  'dracula',
  'tomorrow',
  'espresso',
] satisfies EditorThemeValue[];

/** Returns true when `value` is a recognised EditorThemeValue. */
export function isEditorThemeValue(value: string): value is EditorThemeValue {
  return VALID_THEMES.includes(value);
}

const LS_KEY = 'asciidocollab:editor-preferences';
const DEBOUNCE_MS = 500;

interface EditorPrefs {
  fontSize: number;
  theme: EditorThemeValue;
  scrollSyncEnabled: boolean;
  softWrap: boolean;
  previewStyle: PreviewStyleValue;
  spellIgnore: string[];
}

const DEFAULT_PREFS: EditorPrefs = { fontSize: 14, theme: 'default', scrollSyncEnabled: false, softWrap: true, previewStyle: 'asciidocollab', spellIgnore: [] };

function isStoredPrefs(value: unknown): value is { fontSize?: number; theme?: string; scrollSyncEnabled?: boolean; softWrap?: boolean; previewStyle?: string; spellIgnore?: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function loadFromStorage(): EditorPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isStoredPrefs(parsed)) {
        const rawTheme = parsed.theme;
        const rawPreviewStyle = parsed.previewStyle;
        return {
          fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : DEFAULT_PREFS.fontSize,
          theme: typeof rawTheme === 'string' && isEditorThemeValue(rawTheme) ? rawTheme : DEFAULT_PREFS.theme,
          scrollSyncEnabled: typeof parsed.scrollSyncEnabled === 'boolean' ? parsed.scrollSyncEnabled : DEFAULT_PREFS.scrollSyncEnabled,
          softWrap: typeof parsed.softWrap === 'boolean' ? parsed.softWrap : DEFAULT_PREFS.softWrap,
          previewStyle: typeof rawPreviewStyle === 'string' && isPreviewStyleValue(rawPreviewStyle) ? rawPreviewStyle : DEFAULT_PREFS.previewStyle,
          spellIgnore: toStringArray(parsed.spellIgnore),
        };
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_PREFS;
}

/** Current editor preferences and their setters, synchronised with localStorage and the API. */
interface UseEditorPreferencesResult {
  fontSize: number;
  theme: EditorThemeValue;
  scrollSyncEnabled: boolean;
  softWrap: boolean;
  previewStyle: PreviewStyleValue;
  spellIgnore: string[];
  setFontSize: (size: number) => void;
  setTheme: (theme: EditorThemeValue) => void;
  setScrollSyncEnabled: (enabled: boolean) => void;
  setSoftWrap: (enabled: boolean) => void;
  setPreviewStyle: (style: PreviewStyleValue) => void;
  addSpellIgnore: (word: string) => void;
}

/** Manages editor font size, theme, and scroll sync preference, persisting to localStorage and API. */
export function useEditorPreferences(): UseEditorPreferencesResult {
  const [prefs, setPrefs] = useState<EditorPrefs>(loadFromStorage);
  // Use a ref for the debounce timer so timer changes don't trigger re-renders
  // and the callbacks always see the latest timer ID without stale-closure issues.
  const debounceTimerReference = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetch(`${API_BASE_URL}/auth/me/editor-preferences`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data: Partial<EditorPrefs>) => setPrefs((previous) => ({
        fontSize: typeof data.fontSize === 'number' ? data.fontSize : previous.fontSize,
        theme: typeof data.theme === 'string' && isEditorThemeValue(data.theme) ? data.theme : previous.theme,
        scrollSyncEnabled: typeof data.scrollSyncEnabled === 'boolean' ? data.scrollSyncEnabled : previous.scrollSyncEnabled,
        softWrap: typeof data.softWrap === 'boolean' ? data.softWrap : previous.softWrap,
        previewStyle: typeof data.previewStyle === 'string' && isPreviewStyleValue(data.previewStyle) ? data.previewStyle : previous.previewStyle,
        spellIgnore: Array.isArray(data.spellIgnore) ? toStringArray(data.spellIgnore) : previous.spellIgnore,
      })))
      .catch(() => { /* keep localStorage value on error */ });
  }, []);

  function schedulePut(next: EditorPrefs) {
    if (debounceTimerReference.current) clearTimeout(debounceTimerReference.current);
    debounceTimerReference.current = setTimeout(() => {
      void fetch(`${API_BASE_URL}/auth/me/editor-preferences`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {
        // Transient save failure (e.g. offline): the change still applies for the current
        // session (state + localStorage) and is reconciled on the next successful save.
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

  const setScrollSyncEnabled = useCallback((scrollSyncEnabled: boolean) => {
    setPrefs((previous) => {
      const next = { ...previous, scrollSyncEnabled };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      schedulePut(next);
      return next;
    });
  }, []);

  const setSoftWrap = useCallback((softWrap: boolean) => {
    setPrefs((previous) => {
      const next = { ...previous, softWrap };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      schedulePut(next);
      return next;
    });
  }, []);

  const setPreviewStyle = useCallback((previewStyle: PreviewStyleValue) => {
    setPrefs((previous) => {
      const next = { ...previous, previewStyle };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      schedulePut(next);
      return next;
    });
  }, []);

  const addSpellIgnore = useCallback((word: string) => {
    setPrefs((previous) => {
      if (previous.spellIgnore.includes(word)) return previous;
      const next = { ...previous, spellIgnore: [...previous.spellIgnore, word] };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      schedulePut(next);
      return next;
    });
  }, []);

  return { fontSize: prefs.fontSize, theme: prefs.theme, scrollSyncEnabled: prefs.scrollSyncEnabled, softWrap: prefs.softWrap, previewStyle: prefs.previewStyle, spellIgnore: prefs.spellIgnore, setFontSize, setTheme, setScrollSyncEnabled, setSoftWrap, setPreviewStyle, addSpellIgnore };
}
