import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utilities';

interface EditorToolbarButtonProperties {
  icon: ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
}

/** Icon button with keyboard-accessible tooltip showing label and shortcut. */
export function EditorToolbarButton({
  icon, label, shortcut, onClick, disabled = false,
}: EditorToolbarButtonProperties) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          // Use aria-disabled (not the native `disabled` attribute) so the control
          // stays hoverable/focusable and its tooltip — which carries the reason it
          // is unavailable — can still be shown. The click is guarded below.
          aria-disabled={disabled || undefined}
          onClick={disabled ? undefined : onClick}
          className={cn(
            'h-7 w-7 flex items-center justify-center rounded text-sm hover:bg-muted',
            disabled && 'opacity-40 cursor-default hover:bg-transparent',
          )}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          sideOffset={4}
          className="z-50 rounded bg-popover px-2 py-1 text-xs shadow-md border"
        >
          <span>{label}</span>
          {shortcut && <span className="ml-2 text-muted-foreground">{shortcut}</span>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
