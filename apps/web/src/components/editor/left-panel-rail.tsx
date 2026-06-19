'use client';
import { useRef } from 'react';
import { FolderTree, ListTree, ChevronLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LeftPanelTab } from '@/hooks/use-editor-preferences';

interface LeftPanelRailProperties {
  activeTab: LeftPanelTab;
  // Called with the selected view id when the user activates a different tab.
  onTabChange: (tab: LeftPanelTab) => void;
  // When provided, renders a collapse control at the TOP of the rail — always visible regardless of
  // the active view, so the panel can be collapsed from Outline as well as Files.
  onCollapse?: () => void;
}

interface RailView {
  id: LeftPanelTab;
  label: string;
  icon: LucideIcon;
}

// Data-driven view list (FR-015): adding a third view (e.g. search/history) is a one-line append, no
// redesign — the rail, roving focus, and rendering all derive from this array.
const VIEWS: readonly RailView[] = [
  { id: 'files', label: 'Files', icon: FolderTree },
  { id: 'outline', label: 'Outline', icon: ListTree },
];

/**
 * The vertical ARIA tablist rail selecting the active left-panel view (028). Icon-only, ~46px wide,
 * with a 2px primary accent bar on the active tab. Roving focus: ArrowUp/ArrowDown move (and wrap)
 * between tabs, mirroring the WAI-ARIA vertical tablist pattern.
 */
export function LeftPanelRail({ activeTab, onTabChange, onCollapse }: LeftPanelRailProperties) {
  const buttonReferences = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = VIEWS.findIndex((view) => view.id === activeTab);

  function moveFocus(nextIndex: number) {
    const wrapped = (nextIndex + VIEWS.length) % VIEWS.length;
    onTabChange(VIEWS[wrapped].id);
    buttonReferences.current[wrapped]?.focus();
  }

  return (
    <div className="flex flex-col items-center gap-1 w-[46px] shrink-0 border-r py-2 bg-popover">
      {onCollapse && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label="collapse sidebar"
          title="Collapse panel"
          onClick={onCollapse}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label="Left panel views"
        className="flex flex-col items-center gap-1"
      >
        {VIEWS.map((view, index) => {
        const Icon = view.icon;
        const isActive = view.id === activeTab;
        return (
          <button
            key={view.id}
            ref={(element) => { buttonReferences.current[index] = element; }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls="left-panel-body"
            aria-label={view.label}
            title={view.label}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(view.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(activeIndex + 1); }
              else if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(activeIndex - 1); }
            }}
            className={`relative flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary" aria-hidden="true" />
            )}
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
      </div>
    </div>
  );
}
