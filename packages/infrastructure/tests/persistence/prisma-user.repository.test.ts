import { UserRepository } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaUserRepository } from '../../src/persistence/prisma-user.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';
import { createTestUser } from '../helpers/test-data';
import { UserId, Email } from '@asciidocollab/domain';

describe('PrismaUserRepository', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let repo: UserRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    repo = new PrismaUserRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    await client.user.deleteMany();
  });

  it('should save and find a user by id', async () => {
    const user = createTestUser();
    await repo.save(user);
    const found = await repo.findById(user.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(user.id.value);
    expect(found!.email.value).toBe(user.email.value);
    expect(found!.displayName).toBe(user.displayName);
  });

  it('should return null when finding by non-existent id', async () => {
    const result = await repo.findById(UserId.create('00000000-0000-4000-8000-000000000001'));
    expect(result).toBeNull();
  });

  it('should find a user by email', async () => {
    const user = createTestUser();
    await repo.save(user);
    const found = await repo.findByEmail(user.email);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(user.id.value);
  });

  it('should return null when finding by non-existent email', async () => {
    const result = await repo.findByEmail(Email.create('nonexistent@example.com'));
    expect(result).toBeNull();
  });

  it('should update an existing user on save', async () => {
    const user = createTestUser();
    await repo.save(user);

    const updatedUser = createTestUser({ id: user.id, displayName: 'Updated Name' });
    await repo.save(updatedUser);

    const found = await repo.findById(user.id);
    expect(found).not.toBeNull();
    expect(found!.displayName).toBe('Updated Name');
  });

  it('should handle null optional fields', async () => {
    const user = createTestUser({ passwordHash: null, samlSubject: 'saml|user', mfaSecret: null });
    await repo.save(user);
    const found = await repo.findById(user.id);
    expect(found).not.toBeNull();
    expect(found!.passwordHash).toBeNull();
    expect(found!.samlSubject).toBe('saml|user');
    expect(found!.mfaSecret).toBeNull();
  });
});
