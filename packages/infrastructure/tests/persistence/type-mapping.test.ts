import { PrismaClient } from '@prisma/client';
import { startTestContainer, stopTestContainer, TestContainer } from '../helpers/prisma-test-container';
import { createTestUser, createTestProject, createTestProjectMember, createTestFileNode, createTestDocument, createTestAsset, createTestTemplate, createTestGitRepository, createTestAuditLog } from '../helpers/test-data';
import { PrismaUserRepository } from '../../src/persistence/prisma-user.repository';
import { PrismaProjectRepository } from '../../src/persistence/prisma-project.repository';
import { PrismaProjectMemberRepository } from '../../src/persistence/prisma-project-member.repository';
import { PrismaFileNodeRepository } from '../../src/persistence/prisma-file-node.repository';
import { PrismaDocumentRepository } from '../../src/persistence/prisma-document.repository';
import { PrismaAssetRepository } from '../../src/persistence/prisma-asset.repository';
import { PrismaTemplateRepository } from '../../src/persistence/prisma-template.repository';
import { PrismaGitRepositoryRepository } from '../../src/persistence/prisma-git-repository.repository';
import { PrismaAuditLogRepository } from '../../src/persistence/prisma-audit-log.repository';
import { FileNodeType, FilePath, Role, TemplateCategory, GitProvider } from '@asciidocollab/domain';

describe('Type mapping round-trip', () => {
  let container: TestContainer;
  let client: PrismaClient;
  let userRepo: PrismaUserRepository;
  let projectRepo: PrismaProjectRepository;
  let projectMemberRepo: PrismaProjectMemberRepository;
  let fileNodeRepo: PrismaFileNodeRepository;
  let documentRepo: PrismaDocumentRepository;
  let assetRepo: PrismaAssetRepository;
  let templateRepo: PrismaTemplateRepository;
  let gitRepo: PrismaGitRepositoryRepository;
  let auditLogRepo: PrismaAuditLogRepository;

  beforeAll(async () => {
    container = await startTestContainer();
    client = container.client;
    userRepo = new PrismaUserRepository(client);
    projectRepo = new PrismaProjectRepository(client);
    projectMemberRepo = new PrismaProjectMemberRepository(client);
    fileNodeRepo = new PrismaFileNodeRepository(client);
    documentRepo = new PrismaDocumentRepository(client);
    assetRepo = new PrismaAssetRepository(client);
    templateRepo = new PrismaTemplateRepository(client);
    gitRepo = new PrismaGitRepositoryRepository(client);
    auditLogRepo = new PrismaAuditLogRepository(client);
  });

  afterAll(async () => {
    await stopTestContainer(container);
  });

  beforeEach(async () => {
    // Delete in dependency order (children before parents)
    await client.auditLog.deleteMany();
    await client.document.deleteMany();
    await client.asset.deleteMany();
    await client.gitRepository.deleteMany();
    await client.fileNode.deleteMany();
    await client.projectMember.deleteMany();
    await client.template.deleteMany();
    await client.project.deleteMany();
    await client.user.deleteMany();
  });

  describe('User', () => {
    it('should round-trip with all fields populated', async () => {
      const user = createTestUser({
        displayName: 'Alice Smith',
        passwordHash: 'hash123',
        samlSubject: 'alice@idp.example.com',
        mfaSecret: 'MFASECRET123',
      });
      await userRepo.save(user);
      const found = await userRepo.findById(user.id);
      expect(found).not.toBeNull();
      expect(found!.id.value).toBe(user.id.value);
      expect(found!.email.value).toBe(user.email.value);
      expect(found!.displayName).toBe('Alice Smith');
      expect(found!.passwordHash).toBe('hash123');
      expect(found!.samlSubject).toBe('alice@idp.example.com');
      expect(found!.mfaSecret).toBe('MFASECRET123');
    });

    it('should round-trip with mfaSecret as null', async () => {
      const user = createTestUser({
        mfaSecret: null,
      });
      await userRepo.save(user);
      const found = await userRepo.findById(user.id);
      expect(found).not.toBeNull();
      expect(found!.mfaSecret).toBeNull();
      expect(found!.passwordHash).not.toBeNull();
    });

    it('should round-trip with samlSubject and null passwordHash', async () => {
      const user = createTestUser({
        passwordHash: null,
        samlSubject: 'saml-user@idp.com',
      });
      await userRepo.save(user);
      const found = await userRepo.findById(user.id);
      expect(found).not.toBeNull();
      expect(found!.passwordHash).toBeNull();
      expect(found!.samlSubject).toBe('saml-user@idp.com');
    });
  });

  describe('Project', () => {
    it('should round-trip with tags and no description', async () => {
      const owner = createTestUser();
      await userRepo.save(owner);
      const project = createTestProject({
        description: null,
      });
      await projectRepo.save(project);
      const found = await projectRepo.findById(project.id);
      expect(found).not.toBeNull();
      expect(found!.name.value).toBe(project.name.value);
      expect(found!.description).toBeNull();
      expect(found!.tags).toEqual([]);
    });

    it('should round-trip with description and tags', async () => {
      const owner = createTestUser();
      await userRepo.save(owner);
      const project = createTestProject({
        description: 'A documentation project',
      });
      project.update({ tags: ['docs', 'asciidoc'] });
      await projectRepo.save(project);
      const found = await projectRepo.findById(project.id);
      expect(found).not.toBeNull();
      expect(found!.description).toBe('A documentation project');
      expect(found!.tags).toEqual(['docs', 'asciidoc']);
    });
  });

  describe('ProjectMember', () => {
    it('should round-trip with all role values', async () => {
      const owner = createTestUser();
      await userRepo.save(owner);
      const project = createTestProject();
      await projectRepo.save(project);
      const member = createTestUser();
      await userRepo.save(member);

      for (const roleName of ['viewer' as const, 'editor' as const, 'owner' as const]) {
        const pm = createTestProjectMember(project.id, member.id, { role: Role.create(roleName) });
        await projectMemberRepo.addMember(pm);
        const found = await projectMemberRepo.findByCompositeKey(project.id, member.id);
        expect(found).not.toBeNull();
        expect(found!.role.value).toBe(roleName);
        await client.projectMember.deleteMany();
      }
    });
  });

  describe('FileNode', () => {
    it('should round-trip folder with null parentId', async () => {
      const owner = createTestUser();
      await userRepo.save(owner);
      const project = createTestProject();
      await projectRepo.save(project);
      const folder = createTestFileNode(project.id, { type: FileNodeType.create('folder'), name: 'src', path: FilePath.create('/src') });
      await fileNodeRepo.save(folder);
      const found = await fileNodeRepo.findById(folder.id);
      expect(found).not.toBeNull();
      expect(found!.type.value).toBe('folder');
      expect(found!.parentId).toBeNull();
      expect(found!.name).toBe('src');
      expect(found!.path.value).toBe('/src');
    });

    it('should round-trip file node with parentId', async () => {
      const owner = createTestUser();
      await userRepo.save(owner);
      const project = createTestProject();
      await projectRepo.save(project);
      const folder = createTestFileNode(project.id, { type: FileNodeType.create('folder'), name: 'docs', path: FilePath.create('/docs') });
      await fileNodeRepo.save(folder);
      const file = createTestFileNode(project.id, { parentId: folder.id, type: FileNodeType.create('file'), name: 'readme.adoc', path: FilePath.create('/docs/readme.adoc') });
      await fileNodeRepo.save(file);
      const found = await fileNodeRepo.findById(file.id);
      expect(found).not.toBeNull();
      expect(found!.type.value).toBe('file');
      expect(found!.parentId!.value).toBe(folder.id.value);
    });
  });

  describe('Document', () => {
    it('should round-trip with contentId and yjsStateId', async () => {
      const owner = createTestUser();
      await userRepo.save(owner);
      const project = createTestProject();
      await projectRepo.save(project);
      const folder = createTestFileNode(project.id, { type: FileNodeType.create('folder'), name: 'docs', path: FilePath.create('/docs') });
      await fileNodeRepo.save(folder);
      const file = createTestFileNode(project.id, { parentId: folder.id, type: FileNodeType.create('file'), name: 'doc.adoc', path: FilePath.create('/docs/doc.adoc') });
      await fileNodeRepo.save(file);
      const document = createTestDocument(file.id);
      await documentRepo.save(document);
      const found = await documentRepo.findById(document.id);
      expect(found).not.toBeNull();
      expect(found!.fileNodeId.value).toBe(file.id.value);
      expect(found!.mimeType.value).toBe('text/asciidoc');
    });
  });

  describe('Asset', () => {
    it('should round-trip with version chain (parentId)', async () => {
      const owner = createTestUser();
      await userRepo.save(owner);
      const project = createTestProject();
      await projectRepo.save(project);

      const original = createTestAsset(project.id, { sizeBytes: 1024 });
      await assetRepo.save(original);
      const version = createTestAsset(project.id, {
        parentId: original.id,
        sizeBytes: 2048,
      });
      await assetRepo.save(version);
      const foundOriginal = await assetRepo.findById(original.id);
      const foundVersion = await assetRepo.findById(version.id);
      expect(foundOriginal).not.toBeNull();
      expect(foundOriginal!.sizeBytes).toBe(1024);
      expect(foundOriginal!.parentId).toBeNull();
      expect(foundVersion).not.toBeNull();
      expect(foundVersion!.sizeBytes).toBe(2048);
      expect(foundVersion!.parentId!.value).toBe(original.id.value);
    });
  });

  describe('Template', () => {
    it('should round-trip with category enum', async () => {
      const template = createTestTemplate({ name: 'Report', description: 'A report template', category: TemplateCategory.create('report') });
      await templateRepo.save(template);
      const found = await templateRepo.findById(template.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Report');
      expect(found!.category.value).toBe('report');
    });
  });

  describe('GitRepository', () => {
    it('should round-trip with all provider values', async () => {
      const owner = createTestUser();
      await userRepo.save(owner);
      const project = createTestProject();
      await projectRepo.save(project);

      for (const p of ['github' as const, 'gitlab' as const, 'bitbucket' as const]) {
        const repo = createTestGitRepository(project.id, {
          provider: GitProvider.create(p),
          remoteUrl: `https://${p}.com/test/repo`,
          credentialReference: 'cred-1',
          currentBranch: 'main',
          lastSyncAt: null,
        });
        await gitRepo.save(repo);
        const found = await gitRepo.findById(repo.id);
        expect(found).not.toBeNull();
        expect(found!.provider.value).toBe(p);
        expect(found!.lastSyncAt).toBeNull();
        await client.gitRepository.deleteMany();
      }
    });
  });

  describe('AuditLog', () => {
    it('should round-trip with JSON metadata and nullable projectId', async () => {
      const user = createTestUser();
      await userRepo.save(user);
      const log = createTestAuditLog(user.id, {
        action: 'user.login',
        resourceType: 'session',
        resourceId: 'sess-123',
        projectId: null,
        metadata: { ip: '192.168.1.1', userAgent: 'Mozilla/5.0', count: 42 },
      });
      await auditLogRepo.save(log);
      const all = await auditLogRepo.findAll();
      expect(all).toHaveLength(1);
      expect(all[0].action).toBe('user.login');
      expect(all[0].projectId).toBeNull();
      expect(all[0].metadata.ip).toBe('192.168.1.1');
      expect(all[0].metadata.count).toBe(42);
    });
  });
});
