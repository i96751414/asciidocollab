'use client';

import { useTheme, type Theme } from '@/hooks/use-theme';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
];

/** Card allowing the user to choose between light, dark, and system application themes. */
export function AppThemeCard() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application Theme</CardTitle>
        <CardDescription>Choose how AsciiDoCollab looks to you.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3" role="group" aria-label="Application theme">
          {THEME_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
              className={`px-4 py-2 rounded-md border text-sm transition-colors ${
                theme === value
                  ? 'border-primary bg-accent'
                  : 'border-border hover:bg-accent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
