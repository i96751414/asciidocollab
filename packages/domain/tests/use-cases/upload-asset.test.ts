import { UploadAssetUseCase } from '../../src/use-cases/upload-asset';
import { InMemoryProjectMemberRepository } from '../repositories/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../repositories/in-memory-file-node.repository';
import { InMemoryAssetRepository } from '../repositories/in-memory-asset.repository';
import { InMemoryProjectFileStore } from '../storage/in-memory-project-file-store';
import { InMemorySystemSettingRepository } from '../repositories/in-memory-system-setting.repository';
import { InMemoryProjectRepository } from '../repositories/in-memory-project.repository';
import { Project } from '../../src/entities/project';
import { ProjectMember } from '../../src/entities/project-member';
import { FileNode } from '../../src/entities/file-node';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { FileNodeId } from '../../src/value-objects/file-node-id';
import { ProjectName } from '../../src/value-objects/project-name';
import { Role } from '../../src/value-objects/role';
import { FileNodeType } from '../../src/value-objects/file-node-type';
import { FilePath } from '../../src/value-objects/file-path';
import { MimeType } from '../../src/value-objects/mime-type';
import { PermissionDeniedError } from '../../src/errors/permission-denied';
import { FileNodeNotFoundError } from '../../src/errors/file-node-not-found';
import { FileConflictError } from '../../src/errors/file-conflict';
import { ValidationError } from '../../src/errors/validation-error';
import { SETTING_MAX_UPLOAD_SIZE_BYTES } from '../../src/constants';

const DEFAULT_MAX = 20_971_520;

describe('UploadAssetUseCase', () => {
  let projectRepo: InMemoryProjectRepository;
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let assetRepo: InMemoryAssetRepository;
  let fileStore: InMemoryProjectFileStore;
  let systemSettingRepo: InMemorySystemSettingRepository;
  let useCase: UploadAssetUseCase;

  const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const nonMemberId = UserId.create('550e8400-e29b-41d4-a716-446655440009');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
  const smallBytes = Buffer.alloc(100, 0x42);

  beforeEach(async () => {
    projectRepo = new InMemoryProjectRepository();
    projectMemberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    assetRepo = new InMemoryAssetRepository();
    fileStore = new InMemoryProjectFileStore();
    systemSettingRepo = new InMemorySystemSettingRepository();

    useCase = new UploadAssetUseCase(projectMemberRepo, fileNodeRepo, assetRepo, fileStore, systemSettingRepo, DEFAULT_MAX);

    const project = new Project(projectId, ProjectName.create('Test'), null, [], rootFolderId);
    await projectRepo.save(project);

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'Test', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);

    const member = new ProjectMember(projectId, actorId, Role.create('editor'));
    await projectMemberRepo.addMember(member);
  });

  it('creates FileNode + Image for any MIME type (image)', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'photo.png', MimeType.create('image/png'), smallBytes);
    expect(result.success).toBe(true);
  });

  it('creates FileNode + Image for CSV', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'data.csv', MimeType.create('text/csv'), smallBytes);
    expect(result.success).toBe(true);
  });

  it('creates FileNode + Image for PDF', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'doc.pdf', MimeType.create('application/pdf'), smallBytes);
    expect(result.success).toBe(true);
  });

  it('rejects bytes over the DB-configured limit with ValidationError (generic message)', async () => {
    await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, '50');
    const tooBig = Buffer.alloc(100, 0x00);
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'big.png', MimeType.create('image/png'), tooBig);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.message).not.toContain('50');
    }
  });

  it('rejects bytes over defaultMaxUploadSizeBytes when no DB setting', async () => {
    const smallMax = new UploadAssetUseCase(projectMemberRepo, fileNodeRepo, assetRepo, fileStore, systemSettingRepo, 50);
    const tooBig = Buffer.alloc(100, 0x00);
    const result = await smallMax.execute(actorId, projectId, rootFolderId, 'big.png', MimeType.create('image/png'), tooBig);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it('admin-set limit overrides the default', async () => {
    await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, '200');
    const smallDefault = new UploadAssetUseCase(projectMemberRepo, fileNodeRepo, assetRepo, fileStore, systemSettingRepo, 50);
    const medBytes = Buffer.alloc(150, 0x00);
    const result = await smallDefault.execute(actorId, projectId, rootFolderId, 'med.png', MimeType.create('image/png'), medBytes);
    expect(result.success).toBe(true);
  });

  it('rejects non-member with PermissionDeniedError', async () => {
    const result = await useCase.execute(nonMemberId, projectId, rootFolderId, 'x.png', MimeType.create('image/png'), smallBytes);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  it('rejects conflict with FileConflictError', async () => {
    await useCase.execute(actorId, projectId, rootFolderId, 'same.png', MimeType.create('image/png'), smallBytes);
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'same.png', MimeType.create('image/png'), smallBytes);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileConflictError);
    }
  });

  it('MIME type is stored as-is without restriction', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'data.xyz', MimeType.create('application/octet-stream'), smallBytes);
    expect(result.success).toBe(true);
  });

  it('returns ValidationError when MIME type is text/html', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'evil.html', MimeType.create('text/html'), smallBytes);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it('returns ValidationError when MIME type is text/javascript', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'evil.js', MimeType.create('text/javascript'), smallBytes);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it('returns fileNodeId distinct from assetId in the success value', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'photo.png', MimeType.create('image/png'), smallBytes);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.fileNodeId).toBeDefined();
      expect(result.value.fileNodeId.value).not.toEqual(result.value.assetId.value);
    }
  });

  it('accepts image/png', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'photo.png', MimeType.create('image/png'), smallBytes);
    expect(result.success).toBe(true);
  });

  it('accepts application/pdf', async () => {
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'report.pdf', MimeType.create('application/pdf'), smallBytes);
    expect(result.success).toBe(true);
  });

  it('accepts a file exactly at the configured size limit', async () => {
    await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, '100');
    const exactBytes = Buffer.alloc(100, 0x42);
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'exact.png', MimeType.create('image/png'), exactBytes);
    expect(result.success).toBe(true);
  });

  it('rejects a file one byte over the configured size limit', async () => {
    await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, '100');
    const overBytes = Buffer.alloc(101, 0x42);
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'over.png', MimeType.create('image/png'), overBytes);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it('stores asset bytes so they can be read back after upload', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
    const result = await useCase.execute(actorId, projectId, rootFolderId, 'photo.png', MimeType.create('image/png'), bytes);
    expect(result.success).toBe(true);
    if (result.success) {
      const stored = await fileStore.read(projectId, FilePath.create(`/${result.value.storagePath.replace(/^\//, '')}`));
      const storedAlt = await fileStore.read(projectId, FilePath.create(result.value.storagePath));
      expect(stored ?? storedAlt).toEqual(bytes);
    }
  });

  it('falls back to defaultMaxUploadSizeBytes when DB setting is a non-numeric string', async () => {
    await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, 'not-a-number');
    const smallMax = new UploadAssetUseCase(
      projectMemberRepo,
      fileNodeRepo,
      assetRepo,
      fileStore,
      systemSettingRepo,
      50, // tiny default — any file > 50 bytes must be rejected
    );
    const tooBig = Buffer.alloc(100, 0x42);
    const result = await smallMax.execute(
      actorId,
      projectId,
      rootFolderId,
      'big.png',
      MimeType.create('image/png'),
      tooBig,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it('falls back to defaultMaxUploadSizeBytes when DB setting is an empty string', async () => {
    await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, '');
    // Number('') === 0 — every non-empty upload would be rejected regardless of the default;
    // with the fix, NaN/falsy parsed values fall back to the default.
    const smallMax = new UploadAssetUseCase(
      projectMemberRepo,
      fileNodeRepo,
      assetRepo,
      fileStore,
      systemSettingRepo,
      50,
    );
    const tooBig = Buffer.alloc(100, 0x42);
    const result = await smallMax.execute(
      actorId,
      projectId,
      rootFolderId,
      'big.png',
      MimeType.create('image/png'),
      tooBig,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it('returns FileNodeNotFoundError when parentId belongs to a different project', async () => {
    const otherProjectId = ProjectId.create('ff0e8400-e29b-41d4-a716-446655440099');
    const alienFolderId = FileNodeId.create('ee0e8400-e29b-41d4-a716-446655440014');
    const alienFolder = new FileNode(
      alienFolderId,
      otherProjectId,
      null,
      'alienroot',
      FileNodeType.create('folder'),
      FilePath.create('/'),
    );
    await fileNodeRepo.save(alienFolder);

    const result = await useCase.execute(actorId, projectId, alienFolderId, 'img.png', MimeType.create('image/png'), smallBytes);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
    }
  });

  it('accepts a zero-byte (empty) file upload', async () => {
    const result = await useCase.execute(
      actorId,
      projectId,
      rootFolderId,
      'empty.adoc',
      MimeType.create('text/plain'),
      Buffer.alloc(0),
    );
    expect(result.success).toBe(true);
  });

  it('cleans up the disk file when assetRepo.save throws after createExclusive succeeds', async () => {
    assetRepo.save = jest.fn().mockRejectedValue(new Error('DB down'));

    await expect(
      useCase.execute(actorId, projectId, rootFolderId, 'fail.png', MimeType.create('image/png'), smallBytes)
    ).rejects.toThrow('DB down');

    // The file must have been cleaned up — no orphan on disk
    const orphan = await fileStore.read(projectId, FilePath.create('/fail.png'));
    expect(orphan).toBeNull();
  });
});
