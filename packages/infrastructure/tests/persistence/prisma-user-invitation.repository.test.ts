import { PrismaClient } from '@prisma/client';
import { Email, UserInvitation, UserInvitationId, UserId } from '@asciidocollab/domain';
import { PrismaUserInvitationRepository } from '../../src/persistence/prisma-user-invitation.repository';
import { PrismaUserRepository } from '../../src/persistence/prisma-user.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';
import { createTestUser } from '../helpers/test-data';
import { randomUUID } from 'crypto';

function makeInvitation(recipientEmail: string, invitedByUserId: UserId | null = null, overrides?: { expiresAt?: Date; acceptedAt?: Date | null }) {
  return new UserInvitation(
    UserInvitationId.create(randomUUID()),
    Email.create(recipientEmail),
    invitedByUserId,
    `hash-${randomUUID()}`,
    overrides?.expiresAt ?? new Date(Date.now() + 86_400_000),
    overrides?.acceptedAt ?? null,
    new Date(),
  );
}

describe('PrismaUserInvitationRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: PrismaUserInvitationRepository;
  let userRepo: PrismaUserRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaUserInvitationRepository(client);
    userRepo = new PrismaUserRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.userInvitation.deleteMany();
    await client.user.deleteMany();
  });

  it('saves and finds by tokenHash', async () => {
    const inv = makeInvitation('test@example.com');
    await repo.save(inv);

    const found = await repo.findByTokenHash(inv.tokenHash);
    expect(found).not.toBeNull();
    expect(found?.recipientEmail.value).toBe('test@example.com');
    expect(found?.acceptedAt).toBeNull();
  });

  it('returns null when tokenHash not found', async () => {
    const result = await repo.findByTokenHash('nonexistent-hash');
    expect(result).toBeNull();
  });

  it('findPendingByEmail returns valid pending invitation', async () => {
    const inv = makeInvitation('pending@example.com');
    await repo.save(inv);

    const found = await repo.findPendingByEmail(Email.create('pending@example.com'));
    expect(found).not.toBeNull();
    expect(found?.isValid).toBe(true);
  });

  it('findPendingByEmail returns null when accepted', async () => {
    const inv = makeInvitation('accepted@example.com', null, { acceptedAt: new Date() });
    await repo.save(inv);

    const found = await repo.findPendingByEmail(Email.create('accepted@example.com'));
    expect(found).toBeNull();
  });

  it('findPendingByEmail returns null when expired', async () => {
    const inv = makeInvitation('expired@example.com', null, { expiresAt: new Date(Date.now() - 1000) });
    await repo.save(inv);

    const found = await repo.findPendingByEmail(Email.create('expired@example.com'));
    expect(found).toBeNull();
  });

  it('saves with nullable invitedByUserId', async () => {
    const user = createTestUser();
    await userRepo.save(user);
    const inv = makeInvitation('withuser@example.com', user.id);
    await repo.save(inv);

    const found = await repo.findByTokenHash(inv.tokenHash);
    expect(found?.invitedByUserId?.value).toBe(user.id.value);
  });

  it('upsert updates existing invitation (acceptedAt)', async () => {
    const inv = makeInvitation('update@example.com');
    await repo.save(inv);

    const updated = new UserInvitation(
      inv.id,
      inv.recipientEmail,
      inv.invitedByUserId,
      inv.tokenHash,
      inv.expiresAt,
      new Date(),
      inv.createdAt,
    );
    await repo.save(updated);

    const found = await repo.findByTokenHash(inv.tokenHash);
    expect(found?.acceptedAt).not.toBeNull();
  });
});
