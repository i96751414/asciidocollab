import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api/file-content';

// Run the localStorage load as a layout effect on the client (a no-op on the server) so it commits
// BEFORE the browser paints and before any user interaction is possible. This keeps the hydrating
// render matching the server (defaults) — avoiding the React #418 mismatch — while closing the window
// in which a setter could fire against the default state and persist defaults over the saved values.
const useBrowserLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
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

/** Which view the editor's left panel shows (028). Persisted client-only, never synced to the account. */
export type LeftPanelTab = 'files' | 'outline';

/** Returns true when `value` is a recognised LeftPanelTab. */
function isLeftPanelTab(value: unknown): value is LeftPanelTab {
  return value === 'files' || value === 'outline';
}

/** Whether the outline shows the full assembled document or only the open file (032/FR-012). */
export type OutlineScope = 'full' | 'current';

/** Returns true when `value` is a recognised OutlineScope. */
function isOutlineScope(value: unknown): value is OutlineScope {
  return value === 'full' || value === 'current';
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
  spellcheckEnabled: boolean;
  /** 028: the active left-panel view. Client-only — kept in localStorage, never PUT to the account. */
  leftPanelTab: LeftPanelTab;
  /** 029: whether to show included files inline in the editor. Client-only — kept in localStorage, never PUT to the account. */
  showIncludedFiles: boolean;
  /** 032: whether the outline shows the full document or the open file only. Client-only — kept in localStorage, never PUT to the account. */
  outlineScope: OutlineScope;
}

const DEFAULT_PREFS: EditorPrefs = { fontSize: 14, theme: 'default', scrollSyncEnabled: false, softWrap: true, previewStyle: 'asciidocollab', spellIgnore: [], spellcheckEnabled: true, leftPanelTab: 'files', showIncludedFiles: false, outlineScope: 'full' };

// Preference keys kept on THIS device only — never sent to (or read back from) the account API. The
// PUT-payload strip in schedulePut() is driven by this list, so a new client-only preference can never
// leak to the server by omission. The fetch-merge additionally keeps each such key's local value (it
// hardcodes `leftPanelTab` below — extend that too when adding a key here) (028).
const CLIENT_ONLY_KEYS = ['leftPanelTab', 'showIncludedFiles', 'outlineScope'] as const satisfies readonly (keyof EditorPrefs)[];

function isStoredPrefs(value: unknown): value is { fontSize?: number; theme?: string; scrollSyncEnabled?: boolean; softWrap?: boolean; previewStyle?: string; spellIgnore?: unknown; spellcheckEnabled?: boolean; leftPanelTab?: unknown; showIncludedFiles?: unknown; outlineScope?: unknown } {
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
          spellcheckEnabled: typeof parsed.spellcheckEnabled === 'boolean' ? parsed.spellcheckEnabled : DEFAULT_PREFS.spellcheckEnabled,
          leftPanelTab: isLeftPanelTab(parsed.leftPanelTab) ? parsed.leftPanelTab : DEFAULT_PREFS.leftPanelTab,
          showIncludedFiles: typeof parsed.showIncludedFiles === 'boolean' ? parsed.showIncludedFiles : DEFAULT_PREFS.showIncludedFiles,
          outlineScope: isOutlineScope(parsed.outlineScope) ? parsed.outlineScope : DEFAULT_PREFS.outlineScope,
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
  spellcheckEnabled: boolean;
  leftPanelTab: LeftPanelTab;
  showIncludedFiles: boolean;
  outlineScope: OutlineScope;
  setFontSize: (size: number) => void;
  setTheme: (theme: EditorThemeValue) => void;
  setScrollSyncEnabled: (enabled: boolean) => void;
  setSoftWrap: (enabled: boolean) => void;
  setPreviewStyle: (style: PreviewStyleValue) => void;
  addSpellIgnore: (word: string) => void;
  setSpellcheckEnabled: (enabled: boolean) => void;
  setLeftPanelTab: (tab: LeftPanelTab) => void;
  setShowIncludedFiles: (value: boolean) => void;
  setOutlineScope: (scope: OutlineScope) => void;
}

/** Manages editor font size, theme, and scroll sync preference, persisting to localStorage and API. */
export function useEditorPreferences(): UseEditorPreferencesResult {
  // Start from the defaults rather than reading localStorage in the initializer: the editor layout is
  // server-rendered, and the server has no localStorage, so a persisted non-default value (e.g. the
  // chosen left-panel tab or outline scope) would make the client's first render diverge from the
  // server HTML and trip a hydration mismatch (React #418). Instead the stored prefs are loaded once,
  // after mount, so the hydrating render matches the server and then settles to the saved values.
  const [prefs, setPrefs] = useState<EditorPrefs>(DEFAULT_PREFS);
  // Use a ref for the debounce timer so timer changes don't trigger re-renders
  // and the callbacks always see the latest timer ID without stale-closure issues.
  const debounceTimerReference = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the persisted prefs from localStorage on the client only, after hydration. Declared before
  // the account-fetch effect so its values are already in place when that async merge resolves.
  useBrowserLayoutEffect(() => {
    setPrefs(loadFromStorage());
  }, []);

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
        spellcheckEnabled: typeof data.spellcheckEnabled === 'boolean' ? data.spellcheckEnabled : previous.spellcheckEnabled,
        // Client-only keys (see CLIENT_ONLY_KEYS) are never returned by the account API, so always keep
        // the local value — the server response can never overwrite the chosen view or scope.
        leftPanelTab: previous.leftPanelTab,
        showIncludedFiles: previous.showIncludedFiles,
        outlineScope: previous.outlineScope,
      })))
      .catch(() => { /* keep localStorage value on error */ });
  }, []);

  function schedulePut(next: EditorPrefs) {
    if (debounceTimerReference.current) clearTimeout(debounceTimerReference.current);
    // Strip every client-only key from the account payload (no server DTO change needed; the chosen
    // view never leaves this browser). Driven by CLIENT_ONLY_KEYS so a new client-only pref can't leak.
    const serverPayload: Partial<EditorPrefs> = { ...next };
    for (const key of CLIENT_ONLY_KEYS) delete serverPayload[key];
    debounceTimerReference.current = setTimeout(() => {
      void fetch(`${API_BASE_URL}/auth/me/editor-preferences`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverPayload),
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

  const setSpellcheckEnabled = useCallback((spellcheckEnabled: boolean) => {
    setPrefs((previous) => {
      const next = { ...previous, spellcheckEnabled };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      schedulePut(next);
      return next;
    });
  }, []);

  // Client-only setter (028): persists the chosen view to localStorage but never schedules a PUT, so
  // the value stays on this device and is excluded from the account preferences.
  const setLeftPanelTab = useCallback((leftPanelTab: LeftPanelTab) => {
    setPrefs((previous) => {
      const next = { ...previous, leftPanelTab };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Client-only setter (029): persists whether to show included files to localStorage but never
  // schedules a PUT, so the value stays on this device and is excluded from the account preferences.
  const setShowIncludedFiles = useCallback((showIncludedFiles: boolean) => {
    setPrefs((previous) => {
      const next = { ...previous, showIncludedFiles };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Client-only setter (032/FR-012): persists the outline scope (full / current) to localStorage
  // but never schedules a PUT, so the choice stays on this device.
  const setOutlineScope = useCallback((outlineScope: OutlineScope) => {
    setPrefs((previous) => {
      const next = { ...previous, outlineScope };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { fontSize: prefs.fontSize, theme: prefs.theme, scrollSyncEnabled: prefs.scrollSyncEnabled, softWrap: prefs.softWrap, previewStyle: prefs.previewStyle, spellIgnore: prefs.spellIgnore, spellcheckEnabled: prefs.spellcheckEnabled, leftPanelTab: prefs.leftPanelTab, showIncludedFiles: prefs.showIncludedFiles, outlineScope: prefs.outlineScope, setFontSize, setTheme, setScrollSyncEnabled, setSoftWrap, setPreviewStyle, addSpellIgnore, setSpellcheckEnabled, setLeftPanelTab, setShowIncludedFiles, setOutlineScope };
}
