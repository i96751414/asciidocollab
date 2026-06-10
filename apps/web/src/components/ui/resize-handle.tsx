'use client';
import { cn } from '@/lib/utilities';

interface ResizeHandleProperties {
  // Starts a drag — wire to usePanelResize().onPointerDown.
  onPointerDown: (event: React.PointerEvent) => void;
  // Keyboard resizing — wire to usePanelResize().onKeyDown.
  onKeyDown?: (event: React.KeyboardEvent) => void;
  // Highlights the divider while a drag is active.
  isResizing?: boolean;
  // Accessible label such as "Resize file tree".
  ariaLabel: string;
}

/**
 * A thin vertical divider that resizes the adjacent panel. The visible line is 1px; the grab
 * area is wider (and overlaps its neighbours via negative margins) so it stays easy to hit
 * without widening the gutter. Replaces a panel's static border.
 */
export function ResizeHandle({ onPointerDown, onKeyDown, isResizing, ariaLabel }: ResizeHandleProperties) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      data-testid="resize-handle"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative z-10 -mx-[3px] flex w-[7px] shrink-0 cursor-col-resize touch-none',
        'items-stretch justify-center outline-none',
      )}
    >
      <span
        className={cn(
          'w-px transition-colors',
          isResizing ? 'bg-primary' : 'bg-border group-hover:bg-primary/60 group-focus-visible:bg-primary',
        )}
      />
    </div>
  );
}
