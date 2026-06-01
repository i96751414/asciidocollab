import { SendUserInvitationUseCase } from '../../src/use-cases/send-user-invitation';
import { InMemoryUserRepository } from '../repositories/in-memory-user.repository';
import { InMemoryUserInvitationRepository } from '../repositories/in-memory-user-invitation.repository';
import { InMemoryAuditLogRepository } from '../repositories/in-memory-audit-log.repository';
import { User } from '../../src/entities/user';
import { UserId } from '../../src/value-objects/user-id';
import { Email } from '../../src/value-objects/email';
import { Timestamps } from '../../src/value-objects/timestamps';
import { PermissionDeniedError } from '../../src/errors/permission-denied';
import { DuplicateEmailError } from '../../src/errors/duplicate-email';
import { InvitationAlreadyPendingError } from '../../src/errors/invitation-already-pending';
import type { TokenGenerator, PasswordResetTokenData } from '../../src/services/token-generator';
import type { RegistrationInvitationNotifier } from '../../src/services/registration-invitation-notifier';
import { UserInvitation } from '../../src/entities/user-invitation';
import { UserInvitationId } from '../../src/value-objects/user-invitation-id';
import { randomUUID } from 'crypto';

const mockToken: PasswordResetTokenData = {
  token: 'raw-token-abc123',
  hashedToken: 'hashed-token',
  expiresAt: new Date(Date.now() + 72 * 3_600_000),
};

const tokenGenerator: TokenGenerator = {
  generatePasswordResetToken: () => mockToken,
  generateInvitationToken: () => mockToken,
  generateEmailVerificationToken: () => mockToken,
  hashToken: (t) => `hashed-${t}`,
};

function makeUser(isAdmin = false): User {
  return new User(
    UserId.create(randomUUID()),
    Email.create('actor@example.com'),
    'Actor User',
    'hashed-password',
    [],
    null,
    null,
    isAdmin,
    new Timestamps(),
    true,
    'SELF_REGISTERED',
  );
}

describe('SendUserInvitationUseCase', () => {
  let userRepo: InMemoryUserRepository;
  let invitationRepo: InMemoryUserInvitationRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let notifier: RegistrationInvitationNotifier;
  let useCase: SendUserInvitationUseCase;
  let adminActor: User;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    invitationRepo = new InMemoryUserInvitationRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    notifier = { sendInvitation: jest.fn().mockResolvedValue(undefined) };
    useCase = new SendUserInvitationUseCase(userRepo, invitationRepo, auditLogRepo, tokenGenerator, notifier);
    adminActor = makeUser(true);
  });

  test('returns PermissionDeniedError when actor is not admin', async () => {
    const nonAdmin = makeUser(false);
    await userRepo.save(nonAdmin);

    const result = await useCase.execute(nonAdmin.id, Email.create('invite@example.com'), 'Actor Name');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(PermissionDeniedError);
    expect(notifier.sendInvitation).not.toHaveBeenCalled();
  });

  test('returns DuplicateEmailError when email already registered', async () => {
    await userRepo.save(adminActor);
    const existing = new User(
      UserId.create(randomUUID()),
      Email.create('already@example.com'),
      'Existing',
      'hash',
      [],
      null,
      null,
      false,
      new Timestamps(),
      true,
      'SELF_REGISTERED',
    );
    await userRepo.save(existing);

    const result = await useCase.execute(adminActor.id, Email.create('already@example.com'), 'Admin');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(DuplicateEmailError);
    expect(notifier.sendInvitation).not.toHaveBeenCalled();
  });

  test('returns InvitationAlreadyPendingError when pending invitation exists', async () => {
    await userRepo.save(adminActor);
    const pendingInvite = new UserInvitation(
      UserInvitationId.create(randomUUID()),
      Email.create('pending@example.com'),
      adminActor.id,
      'some-hash',
      new Date(Date.now() + 86_400_000),
      null,
      new Date(),
    );
    await invitationRepo.save(pendingInvite);

    const result = await useCase.execute(adminActor.id, Email.create('pending@example.com'), 'Admin');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(InvitationAlreadyPendingError);
    expect(notifier.sendInvitation).not.toHaveBeenCalled();
  });

  test('invitation is not saved when SMTP throws (atomicity)', async () => {
    await userRepo.save(adminActor);
    (notifier.sendInvitation as jest.Mock).mockRejectedValue(new Error('SMTP down'));

    await expect(
      useCase.execute(adminActor.id, Email.create('new@example.com'), 'Admin'),
    ).rejects.toThrow('SMTP down');

    const invitations = await invitationRepo.findAll();
    expect(invitations).toHaveLength(0);
  });

  test('success: invitation saved and notifier called', async () => {
    await userRepo.save(adminActor);

    const result = await useCase.execute(adminActor.id, Email.create('newuser@example.com'), 'Admin Name');

    expect(result.success).toBe(true);
    expect(notifier.sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'newuser@example.com' }),
      mockToken.token,
      'Admin Name',
    );
    const invitations = await invitationRepo.findAll();
    expect(invitations).toHaveLength(1);
    expect(invitations[0].tokenHash).toBe(mockToken.hashedToken);
    const logs = await auditLogRepo.findAll();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('user.invitation_sent');
  });
});
