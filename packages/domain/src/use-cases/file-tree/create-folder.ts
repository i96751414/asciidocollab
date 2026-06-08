import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { FilePath } from '../../value-objects/file-path';
import { FileName } from '../../value-objects/file-name';
import { FileNodeType } from '../../value-objects/file-node-type';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { buildParentPath } from './file-tree-helpers';
import { FileNodeNotFoundError } from '../../errors/file-node-not-found';
import { FileConflictError } from '../../errors/file-conflict';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { FileNode } from '../../entities/file-node';
import { randomUUID } from 'crypto';

/** Creates a new folder node in the file tree and its directory on disk. */
export class CreateFolderUseCase {
  /** Initializes the use case with the repositories and file store required to create a folder. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  /** Validates membership, creates the directory on disk and the folder node in the database. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    parentId: FileNodeId,
    name: string,
  ): Promise<Result<{ fileNodeId: FileNodeId; path: FilePath }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const parent = await this.fileNodeRepo.findById(parentId);
    if (!parent || parent.type.value !== 'folder') {
      return { success: false, error: new FileNodeNotFoundError(parentId.value) };
    }

    const siblings = await this.fileNodeRepo.findByParentId(parentId);
    const duplicate = siblings.find((n) => n.name === name && n.type.value === 'folder');
    if (duplicate) {
      return { success: false, error: new FileConflictError(`Folder '${name}' already exists`, duplicate.id.value) };
    }

    FileName.create(name); // throws ValidationError for invalid names
    const parentPath = buildParentPath(parent.path.value);
    const newPath = FilePath.create(`${parentPath}${name}`);

    await this.fileStore.createDirectory(projectId, newPath);

    const fileNodeId = FileNodeId.create(randomUUID());
    const fileNode = new FileNode(fileNodeId, projectId, parentId, name, FileNodeType.create('folder'), newPath);
    await this.fileNodeRepo.save(fileNode);

    return { success: true, value: { fileNodeId, path: newPath } };
  }
}
