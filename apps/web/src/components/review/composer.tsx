'use client';

import { useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import {
  REACTION_EMOJI_ALLOWLIST,
  REVIEW_BODY_MAX_LEN,
  type CreateAnchorInput,
  type ReviewItemKind,
} from '@asciidocollab/shared';
import { createReviewItem, replyToThread, editReviewItem } from '@/lib/api/review';
import { cn } from '@/lib/utilities';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Fields shared by both composer modes. */
interface CommonComposerProperties {
  /** Called after a successful create/reply so the owner can refetch. */
  onSubmitted?: () => void;
  /** Called when the user dismisses the composer (Cancel). */
  onCancel?: () => void;
  /** Focuses the textarea on mount (used for the inline reply composer). */
  autoFocus?: boolean;
  /** Placeholder text for the textarea. */
  placeholder?: string;
  /**
   * Sets the active thread id when the textarea gains focus (FR-028 linkage).
   *
   * @param id - The thread id to activate, or null to clear it.
   */
  setActiveThreadId?: (id: string | null) => void;
}

/** New-comment mode: creates a root item on a captured passage anchor. */
export interface NewCommentComposerProperties extends CommonComposerProperties {
  /** Discriminant selecting new-comment mode. */
  mode: 'new';
  /** The owning project id. */
  projectId: string;
  /** The document the new item attaches to. */
  documentId: string;
  /** The captured selection anchor from {@link captureAnchor}. */
  anchor: CreateAnchorInput;
  /** The kind to create; defaults to `comment`. */
  kind?: ReviewItemKind;
}

/** Reply mode: appends a reply to an existing thread's root. */
export interface ReplyComposerProperties extends CommonComposerProperties {
  /** Discriminant selecting reply mode. */
  mode: 'reply';
  /** The owning project id. */
  projectId: string;
  /** The root item id to reply under. */
  rootId: string;
}

/** Edit mode: replaces the body of an existing item (author only). */
export interface EditComposerProperties extends CommonComposerProperties {
  /** Discriminant selecting edit mode. */
  mode: 'edit';
  /** The owning project id. */
  projectId: string;
  /** The item id whose body is being edited. */
  itemId: string;
  /** The item's current body, pre-filled into the field. */
  initialBody: string;
}

/** The discriminated union of composer modes. */
export type CommentComposerProperties =
  | NewCommentComposerProperties
  | ReplyComposerProperties
  | EditComposerProperties;

/**
 * A plain-text (+ emoji) composer for review comments. In `new` mode it creates a
 * root comment/task on a captured anchor via {@link createReviewItem}; in `reply`
 * mode it appends to a thread via {@link replyToThread}. The body is capped at
 * {@link REVIEW_BODY_MAX_LEN} with a live counter, an emoji-insert popover appends
 * emoji at the caret, and focusing the field publishes the active thread id
 * (FR-028). On success the field clears and `onSubmitted` fires.
 */
export function CommentComposer(props: CommentComposerProperties) {
  const {
    onSubmitted,
    onCancel,
    autoFocus = false,
    placeholder = 'Add a comment…',
    setActiveThreadId,
  } = props;

  const [body, setBody] = useState(props.mode === 'edit' ? props.initialBody : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaReference = useRef<HTMLTextAreaElement>(null);

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= REVIEW_BODY_MAX_LEN && !submitting;

  const insertEmoji = (emoji: string) => {
    const element = textareaReference.current;
    if (!element) {
      setBody((value) => value + emoji);
      return;
    }
    const start = element.selectionStart ?? body.length;
    const end = element.selectionEnd ?? body.length;
    const next = body.slice(0, start) + emoji + body.slice(end);
    setBody(next.slice(0, REVIEW_BODY_MAX_LEN));
    // Restore the caret just after the inserted emoji on the next tick.
    requestAnimationFrame(() => {
      element.focus();
      const caret = start + emoji.length;
      element.setSelectionRange(caret, caret);
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (props.mode === 'new') {
        await createReviewItem(props.projectId, props.documentId, {
          kind: props.kind ?? 'comment',
          body: trimmed,
          anchor: props.anchor,
        });
      } else if (props.mode === 'reply') {
        await replyToThread(props.projectId, props.rootId, { body: trimmed });
      } else {
        await editReviewItem(props.projectId, props.itemId, { body: trimmed });
      }
      // Keep the edited text in place; other modes clear for the next entry.
      if (props.mode !== 'edit') setBody('');
      onSubmitted?.();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFocus = () => {
    setActiveThreadId?.(props.mode === 'reply' ? props.rootId : null);
  };

  const remaining = REVIEW_BODY_MAX_LEN - body.length;
  const submitLabel = { new: 'Comment', reply: 'Reply', edit: 'Save' }[props.mode];

  return (
    <div className="flex flex-col gap-1.5" data-testid="comment-composer">
      <textarea
        ref={textareaReference}
        value={body}
        placeholder={placeholder}
        maxLength={REVIEW_BODY_MAX_LEN}
        autoFocus={autoFocus}
        onFocus={handleFocus}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Ctrl/Cmd+Enter submits; Escape cancels.
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void submit();
          } else if (event.key === 'Escape' && onCancel) {
            onCancel();
          }
        }}
        rows={3}
        className="min-h-[64px] w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Insert emoji"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <SmilePlus className="h-4 w-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto">
            <div className="grid grid-cols-6 gap-0.5 p-0.5">
              {REACTION_EMOJI_ALLOWLIST.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Insert ${emoji}`}
                  onClick={() => insertEmoji(emoji)}
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-base transition-colors hover:bg-accent"
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <span
          className={cn(
            'ml-auto text-[10px] tabular-nums text-muted-foreground',
            remaining < 0 && 'text-destructive',
          )}
        >
          {remaining}
        </span>

        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={!canSubmit}
          data-testid="review-composer-submit"
          onClick={() => void submit()}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
