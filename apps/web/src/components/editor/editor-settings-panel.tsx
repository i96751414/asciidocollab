import * as Select from '@radix-ui/react-select';
import type { EditorThemeValue } from '@/hooks/use-editor-preferences';
import { isEditorThemeValue } from '@/hooks/use-editor-preferences';
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from '@/lib/editor-config';

interface EditorSettingsPanelProperties {
  fontSize: number;
  theme: EditorThemeValue;
  setFontSize: (size: number) => void;
  setTheme: (theme: EditorThemeValue) => void;
}

const THEME_OPTIONS: { value: EditorThemeValue; label: string }[] = [
  { value: 'default',       label: 'Default' },
  { value: 'tomorrow',      label: 'Tomorrow' },
  { value: 'dracula',       label: 'Dracula' },
  { value: 'espresso',      label: 'Espresso' },
  { value: 'high-contrast', label: 'High Contrast' },
];

/** Font size stepper and theme selector for the AsciiDoc editor. */
export function EditorSettingsPanel({ fontSize, theme, setFontSize, setTheme }: EditorSettingsPanelProperties) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Font Size</label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Decrease font size"
            className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted"
            onClick={() => setFontSize(Math.max(FONT_SIZE_MIN, fontSize - 1))}
            disabled={fontSize <= FONT_SIZE_MIN}
          >
            -
          </button>
          <input
            type="number"
            value={fontSize}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            aria-label="Font size"
            className="h-7 w-12 text-center text-sm border rounded"
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value >= FONT_SIZE_MIN && value <= FONT_SIZE_MAX) setFontSize(value);
            }}
          />
          <button
            type="button"
            aria-label="Increase font size"
            className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted"
            onClick={() => setFontSize(Math.min(FONT_SIZE_MAX, fontSize + 1))}
            disabled={fontSize >= FONT_SIZE_MAX}
          >
            +
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Theme</label>
        <Select.Root
          value={theme}
          onValueChange={(value) => {
            if (isEditorThemeValue(value)) setTheme(value);
          }}
        >
          <Select.Trigger className="flex h-8 w-full items-center justify-between rounded border px-2 text-sm">
            <Select.Value />
            <Select.Icon>▾</Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="rounded border bg-popover shadow-md z-50">
              <Select.Viewport>
                {THEME_OPTIONS.map(({ value, label }) => (
                  <Select.Item
                    key={value}
                    value={value}
                    className="px-2 py-1 text-sm cursor-pointer hover:bg-muted flex items-center gap-1"
                  >
                    <Select.ItemText>{label}</Select.ItemText>
                    <Select.ItemIndicator>✓</Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
    </div>
  );
}
