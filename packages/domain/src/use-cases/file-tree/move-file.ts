import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { FilePath } from '../../value-objects/file-path';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { PermissionDeniedError } from '../../errors/permission-denied';
import { FileNodeNotFoundError } from '../../errors/file-node-not-found';
import { CannotDeleteRootFolderError } from '../../errors/cannot-delete-root-folder';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { FileNode } from '../../entities/file-node';
import { Timestamps } from '../../value-objects/timestamps';
import { cascadePathUpdate, buildParentPath } from './file-tree-helpers';

/** Moves a file or folder to a different parent folder within the same project. */
export class MoveFileUseCase {
  /** Initializes the use case with the repositories and file store required to move a node. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly fileStore: ProjectFileStore,
  ) {}

  /** Validates membership, moves the file on disk to its new parent path, and updates the database record. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
    newParentId: FileNodeId,
  ): Promise<Result<{ fileNodeId: FileNodeId; newPath: FilePath }, DomainError>> {
    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const fileNode = await this.fileNodeRepo.findById(fileNodeId);
    if (!fileNode || fileNode.projectId.value !== projectId.value) {
      return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
    }

    if (fileNode.parentId === null) {
      return { success: false, error: new CannotDeleteRootFolderError(fileNodeId.value) };
    }

    const newParent = await this.fileNodeRepo.findById(newParentId);
    if (!newParent || newParent.type.value !== 'folder' || newParent.projectId.value !== projectId.value) {
      return { success: false, error: new FileNodeNotFoundError(newParentId.value) };
    }

    const parentPath = buildParentPath(newParent.path.value);
    const newPath = FilePath.create(`${parentPath}${fileNode.name}`);

    const moveResult = await this.fileStore.move(projectId, fileNode.path, newPath);
    if (!moveResult.success) {
      return { success: false, error: moveResult.error };
    }

    const updated = new FileNode(
      fileNode.id,
      fileNode.projectId,
      newParentId,
      fileNode.name,
      fileNode.type,
      newPath,
      new Timestamps(fileNode.createdAt, new Date()),
    );
    await this.fileNodeRepo.save(updated);

    if (fileNode.type.value === 'folder') {
      await cascadePathUpdate(this.fileNodeRepo, fileNodeId, fileNode.path.value + '/', newPath.value + '/');
    }

    return { success: true, value: { fileNodeId, newPath } };
  }
}
