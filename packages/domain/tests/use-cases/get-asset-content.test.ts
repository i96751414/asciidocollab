import { GetAssetContentUseCase } from '../../src/use-cases/get-asset-content';
import { InMemoryProjectMemberRepository } from '../ports/project/in-memory-project-member.repository';
import { InMemoryFileNodeRepository } from '../ports/file-tree/in-memory-file-node.repository';
import { InMemoryAssetRepository } from '../ports/file-tree/in-memory-asset.repository';
import { InMemoryProjectFileStore } from '../ports/storage/in-memory-project-file-store';
import { ProjectMember } from '../../src/entities/project-member';
import { FileNode } from '../../src/entities/file-node';
import { Asset } from '../../src/entities/asset';
import { UserId } from '../../src/value-objects/user-id';
import { ProjectId } from '../../src/value-objects/project-id';
import { FileNodeId } from '../../src/value-objects/file-node-id';
import { AssetId } from '../../src/value-objects/asset-id';
import { Role } from '../../src/value-objects/role';
import { FileNodeType } from '../../src/value-objects/file-node-type';
import { FilePath } from '../../src/value-objects/file-path';
import { MimeType } from '../../src/value-objects/mime-type';
import { PermissionDeniedError } from '../../src/errors/permission-denied';
import { ContentNotFoundError } from '../../src/errors/content-not-found';
import { FileNodeNotFoundError } from '../../src/errors/file-node-not-found';

describe('GetAssetContentUseCase', () => {
  let projectMemberRepo: InMemoryProjectMemberRepository;
  let fileNodeRepo: InMemoryFileNodeRepository;
  let assetRepo: InMemoryAssetRepository;
  let fileStore: InMemoryProjectFileStore;
  let useCase: GetAssetContentUseCase;

  const actorId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const nonMemberId = UserId.create('550e8400-e29b-41d4-a716-446655440009');
  const projectId = ProjectId.create('770e8400-e29b-41d4-a716-446655440003');
  const rootFolderId = FileNodeId.create('880e8400-e29b-41d4-a716-446655440004');
  const fileNodeId = FileNodeId.create('aa0e8400-e29b-41d4-a716-446655440006');
  const assetId = AssetId.create('bb0e8400-e29b-41d4-a716-446655440007');
  const filePath = FilePath.create('/photo.png');
  const fileBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
  const mimeType = MimeType.create('image/png');

  beforeEach(async () => {
    projectMemberRepo = new InMemoryProjectMemberRepository();
    fileNodeRepo = new InMemoryFileNodeRepository();
    assetRepo = new InMemoryAssetRepository();
    fileStore = new InMemoryProjectFileStore();

    useCase = new GetAssetContentUseCase(projectMemberRepo, assetRepo, fileNodeRepo, fileStore);

    const rootFolder = new FileNode(rootFolderId, projectId, null, 'Root', FileNodeType.create('folder'), FilePath.create('/'));
    await fileNodeRepo.save(rootFolder);

    const fileNode = new FileNode(fileNodeId, projectId, rootFolderId, 'photo.png', FileNodeType.create('file'), filePath);
    await fileNodeRepo.save(fileNode);

    const image = new Asset(assetId, projectId, 'photo.png', filePath.value, mimeType, fileBytes.length, null);
    await assetRepo.save(image);

    await fileStore.write(projectId, filePath, fileBytes);

    const member = new ProjectMember(projectId, actorId, Role.create('editor'));
    await projectMemberRepo.addMember(member);
  });

  it('returns bytes + mimeType + filename for member for any file type', async () => {
    const result = await useCase.execute(actorId, projectId, assetId);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.bytes).toEqual(fileBytes);
      expect(result.value.mimeType.value).toBe('image/png');
      expect(result.value.filename).toBe('photo.png');
    }
  });

  it('returns PermissionDeniedError for non-member', async () => {
    const result = await useCase.execute(nonMemberId, projectId, assetId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  it('returns ContentNotFoundError when file missing', async () => {
    await fileStore.remove(projectId, filePath);
    const result = await useCase.execute(actorId, projectId, assetId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ContentNotFoundError);
    }
  });

  it('returns FileNodeNotFoundError when the image belongs to a different project', async () => {
    const otherProjectId = ProjectId.create('ff0e8400-e29b-41d4-a716-446655440099');
    const alienAssetId = AssetId.create('cc0e8400-e29b-41d4-a716-446655440010');
    const alienImage = new Asset(alienAssetId, otherProjectId, 'secret.png', '/secret.png', MimeType.create('image/png'), 100, null);
    await assetRepo.save(alienImage);

    // actor is a member of projectId, but alienImage belongs to otherProjectId
    const result = await useCase.execute(actorId, projectId, alienAssetId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FileNodeNotFoundError);
    }
  });
});
