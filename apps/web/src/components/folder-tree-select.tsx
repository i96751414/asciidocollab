'use client';

/**
 * A compact, scrollable tree selector over the project's folders — the scalable alternative to a flat
 * `<select>` for projects with many or deep folders. Renders folders hierarchically with expand and
 * collapse, and selects with a radio (single mode, such as the images directory) or checkboxes (multi
 * mode, such as the font search directories). Controlled: the parent owns the selected set.
 */
import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import type { FolderNode } from '@/hooks/use-project-folders';

interface FolderTreeSelectProperties {
  /** The folder forest to choose from. */
  tree: readonly FolderNode[];
  /** Currently-selected folder paths (0 or 1 entries in single mode). */
  selected: ReadonlySet<string>;
  /**
   * Toggle a folder path's selection.
   *
   * @param path - The folder path being toggled.
   */
  onToggle: (path: string) => void;
  /** When true, folders are checkboxes (multi-select); otherwise radios (single-select). */
  multi: boolean;
  /** When true, the inputs are read-only. */
  disabled?: boolean;
  /** Accessible label for the tree group. */
  ariaLabel: string;
  /** Shown when the project has no folders. */
  emptyLabel: string;
}

/** Collect the ancestor paths of every selected path, so the tree opens revealing the current selection. */
function ancestorsOfSelected(selected: ReadonlySet<string>): Set<string> {
  const expanded = new Set<string>();
  for (const path of selected) {
    const segments = path.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      expanded.add(segments.slice(0, index).join('/'));
    }
  }
  return expanded;
}

/** The scalable folder tree selector. */
export function FolderTreeSelect({
  tree,
  selected,
  onToggle,
  multi,
  disabled,
  ariaLabel,
  emptyLabel,
}: FolderTreeSelectProperties): React.JSX.Element {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => ancestorsOfSelected(selected));
  // In single mode the radios form ONE native radio group so arrow keys navigate between folders; a
  // per-instance name keeps two trees on the same page from bleeding into each other.
  const radioGroupName = useId();

  // Reveal the current selection: expand its ancestors (union, never collapsing what the user opened).
  // The selection can arrive AFTER mount (seeded once the stored config loads), so this can't be a
  // mount-only initializer. Keyed on the selected paths so it fires only when the selection changes.
  const selectedKey = [...selected].toSorted((a, b) => a.localeCompare(b)).join('\n');
  useEffect(() => {
    const wanted = ancestorsOfSelected(new Set(selectedKey.split('\n').filter(Boolean)));
    if (wanted.size === 0) return;
    setExpanded((current) => {
      const next = new Set(current);
      let changed = false;
      for (const path of wanted) {
        if (!next.has(path)) {
          next.add(path);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [selectedKey]);

  function toggleExpanded(path: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  if (tree.length === 0) {
    return <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div
      role={multi ? 'group' : 'radiogroup'}
      aria-label={ariaLabel}
      className="max-h-64 space-y-0.5 overflow-auto rounded-md border p-1"
    >
      {tree.map((node) => (
        <FolderRow
          key={node.path}
          node={node}
          depth={0}
          radioGroupName={radioGroupName}
          selected={selected}
          onToggle={onToggle}
          multi={multi}
          disabled={disabled}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
        />
      ))}
    </div>
  );
}

interface FolderRowProperties {
  node: FolderNode;
  depth: number;
  selected: ReadonlySet<string>;
  onToggle: (path: string) => void;
  multi: boolean;
  disabled?: boolean;
  expanded: ReadonlySet<string>;
  onToggleExpanded: (path: string) => void;
  /** Shared radio-group name (single mode only) so the folder radios form one keyboard-navigable group. */
  radioGroupName: string;
}

/** One folder row plus its (expanded) children. */
function FolderRow({
  node,
  depth,
  selected,
  onToggle,
  multi,
  disabled,
  expanded,
  onToggleExpanded,
  radioGroupName,
}: FolderRowProperties): React.JSX.Element {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.path);
  const isSelected = selected.has(node.path);

  return (
    <div>
      <div className="flex items-center gap-1 text-sm" style={{ paddingLeft: `${depth * 1}rem` }}>
        {hasChildren ? (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`}
            aria-expanded={isExpanded}
            onClick={() => onToggleExpanded(node.path)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <label className="flex flex-1 items-center gap-2 rounded px-1 py-1 hover:bg-accent">
          <input
            type={multi ? 'checkbox' : 'radio'}
            name={multi ? undefined : radioGroupName}
            className="h-4 w-4"
            checked={isSelected}
            disabled={disabled}
            onChange={() => onToggle(node.path)}
            aria-label={node.path}
          />
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{node.name}</span>
        </label>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <FolderRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              onToggle={onToggle}
              multi={multi}
              disabled={disabled}
              expanded={expanded}
              onToggleExpanded={onToggleExpanded}
              radioGroupName={radioGroupName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
