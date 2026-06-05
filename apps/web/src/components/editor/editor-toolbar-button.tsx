import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

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
          disabled={disabled}
          onClick={onClick}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-40 text-sm"
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
