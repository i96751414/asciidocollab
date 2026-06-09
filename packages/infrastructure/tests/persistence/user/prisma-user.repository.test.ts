import { UserRepository } from '@asciidocollab/domain';
import { PrismaClient } from '@prisma/client';
import { PrismaUserRepository } from '../../../src/persistence/user/prisma-user.repository';
import { startTestContainer, stopTestContainer, TestContainer } from '../../helpers/prisma-test-container';
import { createTestUser } from '../../helpers/test-data';
import { UserId, Email, ProjectId } from '@asciidocollab/domain';

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

  it('hasAny reflects whether any users exist', async () => {
    expect(await repo.hasAny()).toBe(false);
    await repo.save(createTestUser({ email: Email.create('hasany@example.com') }));
    expect(await repo.hasAny()).toBe(true);
  });

  it('findAll returns every saved user', async () => {
    await repo.save(createTestUser({ email: Email.create('all1@example.com') }));
    await repo.save(createTestUser({ email: Email.create('all2@example.com') }));
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
  });

  it('delete hard-removes a user', async () => {
    const user = createTestUser({ email: Email.create('delete-me@example.com') });
    await repo.save(user);
    await repo.delete(user.id);
    expect(await repo.findById(user.id)).toBeNull();
  });

  it('countAdmins counts only users with the admin flag', async () => {
    await repo.save(createTestUser({ email: Email.create('admin1@example.com'), isAdmin: true }));
    await repo.save(createTestUser({ email: Email.create('regular@example.com'), isAdmin: false }));
    expect(await repo.countAdmins()).toBe(1);
  });

  it('search matches by display name or email', async () => {
    await repo.save(createTestUser({ email: Email.create('alice@example.com'), displayName: 'Alice Cooper' }));
    await repo.save(createTestUser({ email: Email.create('bob@example.com'), displayName: 'Bob Dylan' }));

    const byName = await repo.search('cooper');
    expect(byName.map((u) => u.email.value)).toContain('alice@example.com');

    const byEmail = await repo.search('bob@example.com');
    expect(byEmail.map((u) => u.email.value)).toContain('bob@example.com');
  });

  it('search can exclude members of a given project', async () => {
    await repo.save(createTestUser({ email: Email.create('searchexclude@example.com'), displayName: 'Searchable' }));
    // No memberships exist for this throwaway project id, so nothing is excluded —
    // this exercises the excludeProjectId branch of the query builder.
    const results = await repo.search('searchable', ProjectId.create('00000000-0000-4000-8000-0000000000aa'));
    expect(results.map((u) => u.email.value)).toContain('searchexclude@example.com');
  });
});
