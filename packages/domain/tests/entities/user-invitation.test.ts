import { UserInvitation } from '../../src/entities/user-invitation';
import { UserInvitationId } from '../../src/value-objects/user-invitation-id';
import { Email } from '../../src/value-objects/email';
import { randomUUID } from 'crypto';

function makeInvitation(overrides?: Partial<{
  acceptedAt: Date | null;
  expiresAt: Date;
}>) {
  return new UserInvitation(
    UserInvitationId.create(randomUUID()),
    Email.create('recipient@example.com'),
    null,
    'sha256hashvalue',
    overrides?.expiresAt ?? new Date(Date.now() + 86_400_000),
    overrides?.acceptedAt ?? null,
    new Date(),
  );
}

describe('UserInvitation', () => {
  describe('isAccepted', () => {
    test('returns false when acceptedAt is null', () => {
      const invitation = makeInvitation({ acceptedAt: null });
      expect(invitation.isAccepted).toBe(false);
    });

    test('returns true when acceptedAt is set', () => {
      const invitation = makeInvitation({ acceptedAt: new Date() });
      expect(invitation.isAccepted).toBe(true);
    });
  });

  describe('isExpired', () => {
    test('returns false when expiresAt is in the future', () => {
      const invitation = makeInvitation({ expiresAt: new Date(Date.now() + 3_600_000) });
      expect(invitation.isExpired).toBe(false);
    });

    test('returns true when expiresAt is in the past', () => {
      const invitation = makeInvitation({ expiresAt: new Date(Date.now() - 1000) });
      expect(invitation.isExpired).toBe(true);
    });
  });

  describe('isValid', () => {
    test('returns true when not accepted and not expired', () => {
      const invitation = makeInvitation({
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      expect(invitation.isValid).toBe(true);
    });

    test('returns false when already accepted', () => {
      const invitation = makeInvitation({
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      expect(invitation.isValid).toBe(false);
    });

    test('returns false when expired', () => {
      const invitation = makeInvitation({
        acceptedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(invitation.isValid).toBe(false);
    });

    test('returns false when both accepted and expired', () => {
      const invitation = makeInvitation({
        acceptedAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(invitation.isValid).toBe(false);
    });
  });
});
