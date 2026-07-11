'use client';

import { useRef, useState } from 'react';
import { Calendar, ChevronDown, ListChecks, MessageSquare, UserRound } from 'lucide-react';
import type { ReviewItemDto, ReviewItemStatus } from '@asciidocollab/shared';
import { assignTask, convertReviewItem, setTaskStatus } from '@/lib/api/review';
import { classifyDueDate, dueDateTextClass, DUE_DATE_TITLE, formatDueDate } from '@/lib/review/due-date';
import { STATUS_LABELS, STATUS_OPTIONS, STATUS_VARIANTS } from '@/lib/review/status';
import { cn } from '@/lib/utilities';
import { Button } from '@/components/ui/button';
import { badgeVariants } from '@/components/ui/badge';
import { ReviewAvatar } from './thread-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** The label shown when a task has no assignee. */
const UNASSIGNED_LABEL = 'Unassigned';

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
  /** When true, hides every control (viewer/observer mode). */
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
 * Enhances a click on the transparent date input by opening the native picker immediately. On engines
 * without `showPicker` (or in jsdom) this is a no-op and the input still behaves as a normal focusable
 * `<input type="date">` — the user can type or use its own picker — so the date is never a dead end.
 */
function openDatePicker(input: HTMLInputElement | null): void {
  try {
    input?.showPicker?.();
  } catch {
    // showPicker throws without user activation or when disabled; the native input still works.
  }
}

/**
 * The task affordances rendered into {@link ReviewThreadCard}'s `taskControls` slot. For a comment it
 * offers a single "Convert to task" action; for a task it offers an assignee picker (project members
 * plus "Unassigned") and a due-date field. The status picker lives in the card header
 * ({@link ReviewStatusControl}) and revert-to-comment in the overflow menu ({@link RevertTaskAction}),
 * so this row stays to two chips. Every mutation goes through the frozen {@link convertReviewItem} /
 * {@link assignTask} client fns and calls `onChanged` on success. The whole set is hidden when
 * `readOnly`.
 */
export function ReviewTaskControls({
  projectId,
  item,
  members = [],
  readOnly = false,
  onChanged,
}: ReviewTaskControlsProperties) {
  const [pending, setPending] = useState(false);
  const dueInputReference = useRef<HTMLInputElement>(null);

  if (readOnly) return null;

  const isTask = item.kind === 'task';
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
            <span className="max-w-[5rem] truncate">{assigneeLabel}</span>
            <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
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

      {/* Due date: the urgency-coloured date (or placeholder) behind a single themed calendar icon,
          coloured by urgency (overdue → destructive, due today → amber). A fully transparent native
          <input type="date"> overlays it, so it is the real (focusable, labelled) control on every
          engine — showPicker just enhances the click — and no browser draws its own date chrome. */}
      <span className="relative inline-flex items-center rounded-md hover:bg-accent focus-within:ring-1 focus-within:ring-ring">
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs',
            dueDateTextClass(dueStatus ?? 'upcoming'),
          )}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap tabular-nums">
            {item.dueDate ? formatDueDate(item.dueDate) : 'Due date'}
          </span>
        </span>
        <input
          ref={dueInputReference}
          type="date"
          disabled={pending}
          value={item.dueDate ?? ''}
          aria-label="Due date"
          title={DUE_DATE_TITLE[dueStatus ?? 'upcoming']}
          data-testid="task-controls-due-date"
          onClick={() => openDatePicker(dueInputReference.current)}
          onChange={(event) => void handleDueDate(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0 focus-visible:outline-none disabled:cursor-not-allowed"
        />
      </span>
    </div>
  );
}

/** Properties for {@link ReviewStatusControl}. */
export interface ReviewStatusControlProperties {
  /** The owning project id (tenant key for the mutation). */
  projectId: string;
  /** The task whose status this control shows and edits. */
  item: ReviewItemDto;
  /** When true, renders the status as a static badge with no picker (viewer/observer mode). */
  readOnly?: boolean;
  /** Called after a successful status change so the owner can refetch. */
  onChanged?: () => void;
}

/**
 * The task status shown in {@link ReviewThreadCard}'s header, as a badge that doubles as the status
 * picker — clicking it opens the Open / In progress / Resolved / Won't fix menu. Consolidating the
 * badge and the picker keeps the status in one place instead of duplicating it in the header and the
 * controls row. Renders nothing for a non-task; a plain, non-interactive badge when `readOnly`.
 */
export function ReviewStatusControl({ projectId, item, readOnly = false, onChanged }: ReviewStatusControlProperties) {
  const [pending, setPending] = useState(false);

  if (item.kind !== 'task' || !item.status) return null;
  const status = item.status;

  if (readOnly) {
    return (
      <span className={cn(badgeVariants({ variant: STATUS_VARIANTS[status] }), 'text-[10px]')}>
        {STATUS_LABELS[status]}
      </span>
    );
  }

  const handleStatus = async (nextStatus: ReviewItemStatus) => {
    if (pending) return;
    setPending(true);
    try {
      await setTaskStatus(projectId, item.id, { status: nextStatus });
      onChanged?.();
    } catch {
      // A later refetch reconciles; leave the current state in place.
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={`Status: ${STATUS_LABELS[status]}`}
          data-testid="task-controls-status"
          onClick={(event) => event.stopPropagation()}
          className={cn(badgeVariants({ variant: STATUS_VARIANTS[status] }), 'gap-1 pr-1.5 text-[10px]')}
        >
          <span>{STATUS_LABELS[status]}</span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
  );
}

/** Properties for {@link RevertTaskAction}. */
export interface RevertTaskActionProperties {
  /** The owning project id (tenant key for the mutation). */
  projectId: string;
  /** The task to revert back to a plain comment. */
  item: ReviewItemDto;
  /** Hides the action entirely (viewer/observer mode). */
  readOnly?: boolean;
  /** Called after the revert succeeds so the owner can refetch. */
  onChanged?: () => void;
}

/**
 * The "Revert to comment" action for {@link ReviewThreadCard}'s `itemMenuExtra` overflow slot: a rare
 * action that would crowd the controls row, so it lives in the `⋯` menu. Rendered only for a task and
 * when not `readOnly`; the revert goes through the frozen {@link convertReviewItem} client fn.
 */
export function RevertTaskAction({ projectId, item, readOnly = false, onChanged }: RevertTaskActionProperties) {
  const [pending, setPending] = useState(false);

  if (readOnly || item.kind !== 'task') return null;

  const handleRevert = async () => {
    if (pending) return;
    setPending(true);
    try {
      await convertReviewItem(projectId, item.id, { kind: 'comment' });
      onChanged?.();
    } catch {
      // A later refetch reconciles; leave the current state in place (mirrors the other mutations).
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenuItem
      disabled={pending}
      data-testid="task-controls-revert"
      onSelect={() => void handleRevert()}
    >
      <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
      Revert to comment
    </DropdownMenuItem>
  );
}
