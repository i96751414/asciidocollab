import { User } from '../../entities/user';
import { UserId } from '../../value-objects/ids/user-id';
import { Timestamps } from '../../value-objects/common/timestamps';
import { UserInvitation } from '../../entities/user-invitation';
import { AuditLog } from '../../entities/audit-log';
import { AuditLogId } from '../../value-objects/ids/audit-log-id';
import { UserRepository } from '../../ports/user/user.repository';
import { UserInvitationRepository } from '../../ports/user/user-invitation.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { TokenGenerator } from '../../services/token-generator';
import { PasswordHasher } from '../../services/password-hasher';
import { BreachChecker } from '../../services/breach-checker';
import { CommonPasswordChecker } from '../../services/common-password-checker';
import { PasswordPolicy, validatePassword } from '../../value-objects/identity/password-policy';
import { InvalidTokenError } from '../../errors/auth/invalid-token';
import { DuplicateEmailError } from '../../errors/auth/duplicate-email';
import { ValidationError } from '../../errors/common/validation-error';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { randomUUID } from 'crypto';

/** Result returned on successful invitation acceptance. */
export interface AcceptUserInvitationResult {
  /** The newly created user's identifier. */
  userId: UserId;
}

/** Use case for accepting a pending registration invitation and creating the user account. */
export class AcceptUserInvitationUseCase {
  /** Injects the repositories and services required to process an invitation. */
  constructor(
    private readonly userRepo: UserRepository,
    private readonly invitationRepo: UserInvitationRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly tokenGenerator: TokenGenerator,
    private readonly passwordHasher: PasswordHasher,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly commonPasswordChecker: CommonPasswordChecker,
    private readonly breachChecker: BreachChecker,
  ) {}

  /**
   * Accepts an invitation using the raw token from the email link.
   *
   * @param rawToken - The raw invitation token from the email link.
   * @param displayName - Display name chosen by the user.
   * @param password - Password chosen by the user.
   * @returns Success with the new user id, or an error.
   */
  async execute(
    rawToken: string,
    displayName: string,
    password: string,
  ): Promise<Result<AcceptUserInvitationResult, DomainError>> {
    const tokenHash = this.tokenGenerator.hashToken(rawToken);
    return this.executeWithHash(tokenHash, displayName, password);
  }

  /**
   * Accepts an invitation using a pre-hashed token value.
   *
   * @param tokenHash - SHA-256 hash of the raw invitation token.
   * @param displayName - Display name chosen by the user.
   * @param password - Password chosen by the user.
   * @returns Success with the new user id, or an error.
   */
  async executeWithHash(
    tokenHash: string,
    displayName: string,
    password: string,
  ): Promise<Result<AcceptUserInvitationResult, DomainError>> {
    const invitation = await this.invitationRepo.findByTokenHash(tokenHash);
    if (!invitation || !invitation.isValid) {
      return { success: false, error: new InvalidTokenError('Invalid or expired invitation token') };
    }

    if (!displayName || displayName.trim().length === 0) {
      return { success: false, error: new ValidationError('Display name is required') };
    }
    if (displayName.length > 100) {
      return { success: false, error: new ValidationError('Display name must be 100 characters or fewer') };
    }

    const validationError = validatePassword(password, this.passwordPolicy);
    if (validationError) {
      return { success: false, error: new ValidationError(validationError) };
    }

    if (this.commonPasswordChecker.isCommon(password)) {
      return { success: false, error: new ValidationError('Password is too common') };
    }

    try {
      const breached = await this.breachChecker.isBreached(password);
      if (breached) {
        return { success: false, error: new ValidationError('Password has been found in a data breach') };
      }
    } catch {
      // non-blocking
    }

    const existing = await this.userRepo.findByEmail(invitation.recipientEmail);
    if (existing) {
      return { success: false, error: new DuplicateEmailError(invitation.recipientEmail.value) };
    }

    const passwordHash = await this.passwordHasher.hash(password);
    const userId = UserId.create(randomUUID());
    const user = new User(
      userId,
      invitation.recipientEmail,
      displayName.trim(),
      passwordHash,
      [],
      null,
      null,
      false,
      new Timestamps(),
      true,
      'INVITED',
    );
    try {
      await this.userRepo.save(user);
    } catch (saveError) {
      if (
        typeof saveError === 'object' &&
        saveError !== null &&
        'code' in saveError &&
        (saveError.code === '23505' || saveError.code === 'P2002')
      ) {
        return { success: false, error: new DuplicateEmailError(invitation.recipientEmail.value) };
      }
      throw saveError;
    }

    const accepted = new UserInvitation(
      invitation.id,
      invitation.recipientEmail,
      invitation.invitedByUserId,
      invitation.tokenHash,
      invitation.expiresAt,
      new Date(),
      invitation.createdAt,
    );
    await this.invitationRepo.save(accepted);

    await this.auditLogRepo.save(new AuditLog(
      AuditLogId.create(randomUUID()),
      userId,
      null,
      'user.invitation_accepted',
      'User',
      userId.value,
    ));

    return { success: true, value: { userId } };
  }
}
