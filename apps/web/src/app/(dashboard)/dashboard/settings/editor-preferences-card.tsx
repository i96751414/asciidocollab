'use client';

import { useEditorPreferences, EditorThemeValue, isSpellcheckLanguageValue } from '@/hooks/use-editor-preferences';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { PreviewStyleControl } from '@/components/preview-style-control';
import { SPELLCHECK_LANGUAGE_OPTIONS } from '@/lib/codemirror/spellcheck-languages';

const FONT_SIZES = [12, 13, 14, 16, 18, 20] as const;

const EDITOR_THEMES: { value: EditorThemeValue; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'high-contrast', label: 'High Contrast' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'espresso', label: 'Espresso' },
];

/** Card exposing editor font size, theme, scroll sync, and soft wrap preferences. */
export function EditorPreferencesCard() {
  const {
    fontSize, theme, scrollSyncEnabled, softWrap, previewStyle, spellcheckLanguage, spellcheckEnabled,
    setFontSize, setTheme, setScrollSyncEnabled, setSoftWrap, setPreviewStyle, setSpellcheckLanguage, setSpellcheckEnabled,
  } = useEditorPreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Editor Preferences</CardTitle>
        <CardDescription>Customise the behaviour of the document editor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1">
          <Label htmlFor="editorFontSize">Font Size</Label>
          <select
            id="editorFontSize"
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>{size}px</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Editor Theme</Label>
          <div role="group" aria-label="Editor theme" className="flex flex-wrap gap-2">
            {EDITOR_THEMES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent ${
                  theme === value ? 'border-primary bg-accent font-medium' : 'border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Preview Style</Label>
          <CardDescription>How the AsciiDoc preview renders. Applies only to your view.</CardDescription>
          <PreviewStyleControl value={previewStyle} onChange={setPreviewStyle} ariaLabel="Preview style" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="scrollSyncEnabled"
              checked={scrollSyncEnabled}
              onChange={(event) => setScrollSyncEnabled(event.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="scrollSyncEnabled">Scroll Sync</Label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="softWrap"
              checked={softWrap}
              onChange={(event) => setSoftWrap(event.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="softWrap">Soft Wrap</Label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="spellcheckEnabled"
              checked={spellcheckEnabled}
              onChange={(event) => setSpellcheckEnabled(event.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="spellcheckEnabled">Spell Check</Label>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="spellcheckLanguage">Spell Check Language</Label>
          <CardDescription>Document language used for spell checking.</CardDescription>
          <select
            id="spellcheckLanguage"
            value={spellcheckLanguage}
            disabled={!spellcheckEnabled}
            onChange={(event) => { if (isSpellcheckLanguageValue(event.target.value)) setSpellcheckLanguage(event.target.value); }}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            {SPELLCHECK_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
