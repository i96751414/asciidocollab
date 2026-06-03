import { UserId } from '../../../src/value-objects/user-id';
import { SessionRepository } from '../../../src/ports/user/session.repository';

export class InMemorySessionRepository implements SessionRepository {
  readonly deletedUserIds: string[] = [];

  async deleteByUserId(userId: UserId): Promise<void> {
    this.deletedUserIds.push(userId.value);
  }
}
