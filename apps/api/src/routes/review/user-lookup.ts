import { UserId, type UserRepository } from '@asciidocollab/domain';
import type { ReviewUserDto } from '@asciidocollab/shared';
import type { UserLookup } from './dto';

/**
 * Builds a {@link UserLookup} resolving each distinct user id to its display
 * name. Ids that no longer resolve (deleted users) map to null, which the client
 * renders as "Deleted user"/unassigned (FR-024). Batches distinct ids so a
 * thread with many shared authors costs one lookup each.
 *
 * @param userRepo - The user repository.
 * @param ids - The (possibly repeated, possibly null) user ids referenced by the items.
 */
export async function buildUserLookup(
  userRepo: UserRepository,
  ids: Array<string | null>,
): Promise<UserLookup> {
  const distinct = [...new Set(ids.filter((id): id is string => id !== null))];
  const resolved = new Map<string, ReviewUserDto>();
  await Promise.all(
    distinct.map(async (id) => {
      const user = await userRepo.findById(UserId.create(id));
      if (user) resolved.set(id, { id, displayName: user.displayName, avatarKey: user.avatarKey });
    }),
  );
  return (userId: string | null): ReviewUserDto | null =>
    userId === null ? null : resolved.get(userId) ?? null;
}

/** Collects every user id referenced by items (author/assignee/resolver) + reactions. */
export function collectUserIds(
  items: Array<{ authorId: { value: string } | null; assigneeId: { value: string } | null; resolvedById: { value: string } | null }>,
  reactions: Array<{ userId: { value: string } }>,
): Array<string | null> {
  const ids: Array<string | null> = [];
  for (const item of items) {
    ids.push(item.authorId?.value ?? null, item.assigneeId?.value ?? null, item.resolvedById?.value ?? null);
  }
  for (const reaction of reactions) ids.push(reaction.userId.value);
  return ids;
}
