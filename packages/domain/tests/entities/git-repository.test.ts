import { GitRepository } from '../../src/entities/git-repository';
import { GitRepositoryId } from '../../src/value-objects/git-repository-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { GitProvider } from '../../src/value-objects/git-provider';

describe('GitRepository entity', () => {
  const repoId = GitRepositoryId.create('550e8400-e29b-41d4-a716-446655440000');
  const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440001');

  test('creates with all fields', () => {
    const repo = new GitRepository(
      repoId,
      projectId,
      GitProvider.create('github'),
      'https://github.com/user/repo.git',
      'cred-encrypted-abc123',
      'main',
      null,
      new Date('2026-05-26T12:00:00Z'),
    );
    expect(repo.id).toBe(repoId);
    expect(repo.projectId).toBe(projectId);
    expect(repo.provider.value).toBe('github');
    expect(repo.remoteUrl).toBe('https://github.com/user/repo.git');
    expect(repo.credentialRef).toBe('cred-encrypted-abc123');
    expect(repo.currentBranch).toBe('main');
    expect(repo.lastSyncAt).toBeNull();
    expect(repo.createdAt).toBeInstanceOf(Date);
  });

  test('accepts different GitProviders', () => {
    const github = new GitRepository(repoId, projectId, GitProvider.create('github'), 'url', 'cred', 'main', null, new Date());
    const gitlab = new GitRepository(
      GitRepositoryId.create('550e8400-e29b-41d4-a716-446655440002'),
      projectId,
      GitProvider.create('gitlab'),
      'url',
      'cred',
      'main',
      null,
      new Date(),
    );
    const bitbucket = new GitRepository(
      GitRepositoryId.create('550e8400-e29b-41d4-a716-446655440003'),
      projectId,
      GitProvider.create('bitbucket'),
      'url',
      'cred',
      'main',
      null,
      new Date(),
    );
    expect(github.provider.value).toBe('github');
    expect(gitlab.provider.value).toBe('gitlab');
    expect(bitbucket.provider.value).toBe('bitbucket');
  });

  test('rejects invalid GitProvider', () => {
    expect(() => GitProvider.create('gitea')).toThrow();
  });

  test('is unique per project (same projectId)', () => {
    const repo1 = new GitRepository(repoId, projectId, GitProvider.create('github'), 'url1', 'cred1', 'main', null, new Date());
    const repo2 = new GitRepository(
      GitRepositoryId.create('550e8400-e29b-41d4-a716-446655440010'),
      projectId,
      GitProvider.create('gitlab'),
      'url2',
      'cred2',
      'main',
      null,
      new Date(),
    );
    expect(repo1.projectId).toBe(repo2.projectId);
    expect(repo1.id).not.toBe(repo2.id);
  });

  test('createdAt is set on creation', () => {
    const now = new Date();
    const repo = new GitRepository(repoId, projectId, GitProvider.create('github'), 'url', 'cred', 'main', null, now);
    expect(repo.createdAt).toBe(now);
  });
});
