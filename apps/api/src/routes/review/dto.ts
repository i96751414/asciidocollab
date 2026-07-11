import { ReviewComment, ReviewReaction, ReviewAnchor } from '@asciidocollab/domain';
import type {
  ReviewItemDto,
  ThreadDto,
  AnchorDto,
  ReactionSummaryDto,
  ReviewUserDto,
} from '@asciidocollab/shared';

/** Resolves a user id to its wire reference, or null when the user was deleted. */
export type UserLookup = (userId: string | null) => ReviewUserDto | null;

/** Maps a domain anchor to its wire DTO (root items only). */
export function toAnchorDto(anchor: ReviewAnchor | null): AnchorDto | undefined {
  if (anchor === null) return undefined;
  const quote = anchor.quote;
  const relativePos = anchor.relPos;
  return {
    relPos: relativePos === null ? undefined : Buffer.from(relativePos).toString('base64'),
    quote: quote === null ? undefined : { prefix: quote.prefix, exact: quote.exact, suffix: quote.suffix },
    lineHint: anchor.lineHint ?? undefined,
    sectionId: anchor.sectionId ?? undefined,
    state: anchor.state,
  };
}

/**
 * Aggregates one item's reactions into per-emoji summaries, marking the caller's
 * own reactions.
 *
 * @param reactions - Reactions for the single item (already filtered).
 * @param callerId - The requesting user's id.
 */
export function toReactionSummaries(reactions: ReviewReaction[], callerId: string): ReactionSummaryDto[] {
  const byEmoji = new Map<string, ReviewReaction[]>();
  for (const reaction of reactions) {
    const list = byEmoji.get(reaction.emoji) ?? [];
    list.push(reaction);
    byEmoji.set(reaction.emoji, list);
  }
  return [...byEmoji.entries()].map(([emoji, list]) => ({
    emoji,
    count: list.length,
    reactedByMe: list.some((r) => r.userId.value === callerId),
    userIds: list.map((r) => r.userId.value),
  }));
}

/** The backing file for an item's document, supplied by the cross-document (project-wide) list. */
export interface ReviewItemFileReference {
  /** The file node id, so the client can open the file. */
  fileNodeId: string;
  /** A display name for the file. */
  fileName: string;
}

/**
 * Maps one domain review item to its wire DTO. `fileReference` is passed only by the project-wide list so
 * a cross-document view can label each item by file and open it; document-scoped reads omit it.
 */
export function toReviewItemDto(
  item: ReviewComment,
  reactions: ReviewReaction[],
  users: UserLookup,
  callerId: string,
  fileReference?: ReviewItemFileReference,
): ReviewItemDto {
  const status = item.status;
  const assigneeId = item.assigneeId?.value ?? null;
  const dueDate = item.dueDate;
  const resolvedAt = item.resolvedAt;
  return {
    id: item.id.value,
    documentId: item.documentId.value,
    projectId: item.projectId.value,
    parentId: item.parentId?.value ?? undefined,
    kind: item.kind,
    body: item.body,
    author: users(item.authorId?.value ?? null),
    status: status ?? undefined,
    // Assignee is only meaningful on a task; null models an unassigned/deleted user.
    assignee: item.isTask() ? users(assigneeId) : undefined,
    dueDate: dueDate === null ? undefined : dueDate.toISOString().slice(0, 10),
    resolvedAt: resolvedAt === null ? undefined : resolvedAt.toISOString(),
    resolvedBy: resolvedAt === null ? undefined : users(item.resolvedById?.value ?? null),
    anchor: toAnchorDto(item.anchor),
    fileNodeId: fileReference?.fileNodeId,
    fileName: fileReference?.fileName,
    reactions: toReactionSummaries(reactions, callerId),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/**
 * Groups a flat list of items + reactions into threads (root + ordered replies).
 * Replies are attached to their root by `parentId`; both roots and replies carry
 * their own reaction summaries.
 *
 * @param items - Roots and replies for one scope (e.g. A document).
 * @param reactions - All reactions for those items.
 * @param users - Resolver for author/assignee/resolver display names.
 * @param callerId - The requesting user's id.
 */
export function toThreads(
  items: ReviewComment[],
  reactions: ReviewReaction[],
  users: UserLookup,
  callerId: string,
): ThreadDto[] {
  const reactionsByItem = new Map<string, ReviewReaction[]>();
  for (const reaction of reactions) {
    const key = reaction.reviewCommentId.value;
    const list = reactionsByItem.get(key) ?? [];
    list.push(reaction);
    reactionsByItem.set(key, list);
  }
  const dto = (item: ReviewComment): ReviewItemDto =>
    toReviewItemDto(item, reactionsByItem.get(item.id.value) ?? [], users, callerId);

  const roots = items.filter((item) => item.isRoot());
  const repliesByRoot = new Map<string, ReviewComment[]>();
  for (const item of items) {
    if (item.isReply() && item.parentId) {
      const key = item.parentId.value;
      const list = repliesByRoot.get(key) ?? [];
      list.push(item);
      repliesByRoot.set(key, list);
    }
  }
  return roots
    .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((root) => ({
      root: dto(root),
      replies: (repliesByRoot.get(root.id.value) ?? [])
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(dto),
    }));
}
