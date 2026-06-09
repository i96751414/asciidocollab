'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';

/**
 * Compact icon button that flips the application colour theme between light and
 * dark. Reuses the shared `useTheme` provider so it stays in sync with the
 * settings page; it does not own any theme state of its own.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // The resolved theme depends on matchMedia / the persisted preference, neither
  // of which is known during SSR — so the server always renders the light-mode
  // (Moon) variant. Defer reflecting the real theme until after mount to keep the
  // first client render identical to the server and avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className={`h-8 w-8 ${className ?? ''}`}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
