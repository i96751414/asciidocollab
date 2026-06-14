import { UserInvitation } from '../../entities/user-invitation';
import { UserInvitationId } from '../../value-objects/ids/user-invitation-id';
import { AuditLog } from '../../entities/audit-log';
import { AuditLogId } from '../../value-objects/ids/audit-log-id';
import { UserId } from '../../value-objects/ids/user-id';
import { Email } from '../../value-objects/identity/email';
import { UserRepository } from '../../ports/user/user.repository';
import { UserInvitationRepository } from '../../ports/user/user-invitation.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { TokenGenerator } from '../../services/token-generator';
import { RegistrationInvitationNotifier } from '../../services/registration-invitation-notifier';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { DuplicateEmailError } from '../../errors/auth/duplicate-email';
import { InvitationAlreadyPendingError } from '../../errors/members/invitation-already-pending';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { randomUUID } from 'crypto';

/** Use case for sending a registration invitation to an email address. */
export class SendUserInvitationUseCase {
  /** Injects the repositories and services required to create and send an invitation. */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly invitationRepo: UserInvitationRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly tokenGenerator: TokenGenerator,
    private readonly notifier: RegistrationInvitationNotifier,
  ) {}

  /**
   * Sends a registration invitation to the specified email address.
   *
   * @param actorId - ID of the administrator sending the invitation.
   * @param recipientEmail - The email address to invite.
   * @param actorDisplayName - Display name of the inviting admin, included in the email.
   * @returns Success, or an error if the email is already registered or has a pending invitation.
   */
  async execute(
    actorId: UserId,
    recipientEmail: Email,
    actorDisplayName: string,
  ): Promise<Result<undefined, DomainError>> {
    const actor = await this.userRepo.findById(actorId);
    if (!actor?.isAdmin) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const existing = await this.userRepo.findByEmail(recipientEmail);
    if (existing) {
      return { success: false, error: new DuplicateEmailError(recipientEmail.value) };
    }

    const pending = await this.invitationRepo.findPendingByEmail(recipientEmail);
    if (pending) {
      return { success: false, error: new InvitationAlreadyPendingError(recipientEmail.value) };
    }

    const tokenData = this.tokenGenerator.generateInvitationToken();

    // Send email first (atomic: only save on success)
    await this.notifier.sendInvitation(recipientEmail, tokenData.token, actorDisplayName);

    const invitation = new UserInvitation(
      UserInvitationId.create(randomUUID()),
      recipientEmail,
      actorId,
      tokenData.hashedToken,
      tokenData.expiresAt,
      null,
      new Date(),
    );
    await this.invitationRepo.save(invitation);

    await this.auditLogRepo.save(new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      null,
      'user.invitation_sent',
      'UserInvitation',
      invitation.id.value,
    ));

    return { success: true, value: undefined };
  }
}
