'use client';

import { useState } from 'react';
import { Calendar, ChevronDown, ListChecks, MessageSquare, UserRound } from 'lucide-react';
import type { ReviewItemDto, ReviewItemStatus } from '@asciidocollab/shared';
import { assignTask, convertReviewItem, setTaskStatus } from '@/lib/api/review';
import { classifyDueDate, dueDateTextClass, DUE_DATE_TITLE } from '@/lib/review/due-date';
import { cn } from '@/lib/utilities';
import { Button } from '@/components/ui/button';
import { ReviewAvatar } from './thread-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** The label shown when a task has no assignee. */
const UNASSIGNED_LABEL = 'Unassigned';

/** Human labels for each task status, keyed by the {@link ReviewItemStatus} union. */
const STATUS_LABELS: Record<ReviewItemStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wontfix: "Won't fix",
};

/** The statuses offered in the status picker, in lifecycle order. */
const STATUS_OPTIONS: readonly ReviewItemStatus[] = ['open', 'in_progress', 'resolved', 'wontfix'];

/** A minimal project member reference for the assignee picker. */
export interface TaskMember {
  /** The member user's id. */
  id: string;
  /** The member user's display name. */
  displayName: string;
}

/** Properties for {@link ReviewTaskControls}. */
export interface ReviewTaskControlsProperties {
  /** The owning project id (tenant key for the mutations). */
  projectId: string;
  /** The root review item these controls act on. */
  item: ReviewItemDto;
  /**
   * The project members shown in the assignee picker. Sourcing is left to the wiring task; an
   * empty list simply renders only the "Unassigned" option.
   */
  members?: TaskMember[];
  /** When true, hides every control (viewer/observer mode, T043). */
  readOnly?: boolean;
  /** Called after any successful mutation so the owner can refetch. */
  onChanged?: () => void;
}

/** Stops a click from bubbling to the card (which would activate the thread) before running `run`. */
function halt(event: React.MouseEvent, run: () => void): void {
  event.stopPropagation();
  run();
}

/**
 * The US2 task affordances rendered into {@link ReviewThreadCard}'s `taskControls` slot. For a
 * comment it offers a single "Convert to task" action; for a task it offers a revert-to-comment
 * toggle, an assignee picker (project members plus "Unassigned"), a status picker (Open / In
 * progress / Resolved / Won't fix), and a due-date field. Every mutation goes through the frozen
 * {@link convertReviewItem} / {@link assignTask} / {@link setTaskStatus} client fns and calls
 * `onChanged` on success. The whole control set is hidden when `readOnly`.
 */
export function ReviewTaskControls({
  projectId,
  item,
  members = [],
  readOnly = false,
  onChanged,
}: ReviewTaskControlsProperties) {
  const [pending, setPending] = useState(false);

  if (readOnly) return null;

  const isTask = item.kind === 'task';
  const status = item.status ?? 'open';
  const assigneeId = item.assignee?.id ?? null;
  const assigneeLabel = item.assignee?.displayName ?? UNASSIGNED_LABEL;
  const dueStatus = item.dueDate ? classifyDueDate(item.dueDate) : null;

  /** Runs `mutation`, guarding against overlap and refetching on success. */
  const run = async (mutation: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    try {
      await mutation();
      onChanged?.();
    } catch {
      // A later refetch reconciles; leave the current state in place.
    } finally {
      setPending(false);
    }
  };

  const handleConvert = (kind: 'comment' | 'task') =>
    run(() => convertReviewItem(projectId, item.id, { kind }));

  const handleAssign = (nextAssigneeId: string | null) =>
    run(() => assignTask(projectId, item.id, { assigneeId: nextAssigneeId, dueDate: item.dueDate ?? null }));

  const handleStatus = (nextStatus: ReviewItemStatus) =>
    run(() => setTaskStatus(projectId, item.id, { status: nextStatus }));

  const handleDueDate = (value: string) =>
    run(() => assignTask(projectId, item.id, { assigneeId, dueDate: value || null }));

  if (!isTask) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        className="h-7 gap-1 px-2 text-xs"
        data-testid="task-controls-convert"
        onClick={(event) => halt(event, () => void handleConvert('task'))}
      >
        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
        Convert to task
      </Button>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      data-testid="task-controls"
      onClick={(event) => event.stopPropagation()}
    >
      {/* Assignee picker. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Assignee: ${assigneeLabel}`}
            data-testid="task-controls-assignee"
            className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {item.assignee ? (
              <ReviewAvatar user={item.assignee} size={16} />
            ) : (
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="max-w-[7rem] truncate">{assigneeLabel}</span>
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            data-active={assigneeId === null || undefined}
            onSelect={() => void handleAssign(null)}
          >
            {UNASSIGNED_LABEL}
          </DropdownMenuItem>
          {members.map((member) => (
            <DropdownMenuItem
              key={member.id}
              data-active={assigneeId === member.id || undefined}
              onSelect={() => void handleAssign(member.id)}
            >
              {member.displayName}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status picker. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Status: ${STATUS_LABELS[status]}`}
            data-testid="task-controls-status"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span>{STATUS_LABELS[status]}</span>
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option}
              data-active={status === option || undefined}
              onSelect={() => void handleStatus(option)}
            >
              {STATUS_LABELS[option]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Due date; coloured by urgency once set (overdue → destructive, due today → amber). */}
      <label
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs focus-within:ring-1 focus-within:ring-ring hover:bg-accent',
          dueDateTextClass(dueStatus ?? 'upcoming', true),
        )}
        title={DUE_DATE_TITLE[dueStatus ?? 'upcoming']}
      >
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Due date</span>
        <input
          type="date"
          disabled={pending}
          value={item.dueDate ?? ''}
          data-testid="task-controls-due-date"
          onChange={(event) => void handleDueDate(event.target.value)}
          className="bg-transparent text-xs text-current focus-visible:outline-none disabled:cursor-not-allowed"
        />
      </label>

      {/* Revert to a plain comment. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        className="h-7 gap-1 px-2 text-xs"
        data-testid="task-controls-revert"
        onClick={(event) => halt(event, () => void handleConvert('comment'))}
      >
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
        Revert
      </Button>
    </div>
  );
}
