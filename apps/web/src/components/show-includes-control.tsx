'use client';

import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utilities';

interface ShowIncludesControlProperties {
  /** Whether included file bodies are currently shown inline. */
  value: boolean;
  /**
   * Called when the user toggles the control.
   *
   * @param value - The new value (flipped from the current).
   */
  onChange: (value: boolean) => void;
}

/** Icon toggle in the preview header for showing/hiding included file bodies (029). */
export function ShowIncludesControl({ value, onChange }: ShowIncludesControlProperties) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => onChange(!value)}
      data-testid="show-includes-toggle"
      title={value ? 'Hide included files' : 'Show included files'}
      aria-pressed={value}
      aria-label={value ? 'hide included files' : 'show included files'}
      className={cn('h-6 w-6 text-muted-foreground', value && 'bg-accent text-foreground')}
    >
      <Layers className="h-4 w-4" />
    </Button>
  );
}
