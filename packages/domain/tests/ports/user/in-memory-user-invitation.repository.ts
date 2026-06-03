import { UserInvitation } from '../../../src/entities/user-invitation';
import { Email } from '../../../src/value-objects/email';
import { UserInvitationRepository } from '../../../src/ports/user/user-invitation.repository';

export class InMemoryUserInvitationRepository implements UserInvitationRepository {
  private readonly storage = new Map<string, UserInvitation>();

  async save(invitation: UserInvitation): Promise<void> {
    this.storage.set(invitation.id.value, invitation);
  }

  async findByTokenHash(tokenHash: string): Promise<UserInvitation | null> {
    for (const invitation of this.storage.values()) {
      if (invitation.tokenHash === tokenHash) {
        return invitation;
      }
    }
    return null;
  }

  async findPendingByEmail(email: Email): Promise<UserInvitation | null> {
    for (const invitation of this.storage.values()) {
      if (invitation.recipientEmail.value === email.value && invitation.isValid) {
        return invitation;
      }
    }
    return null;
  }

  async findAll(): Promise<UserInvitation[]> {
    return [...this.storage.values()];
  }
}
