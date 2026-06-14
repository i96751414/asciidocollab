import { FileNode } from '../../entities/file-node';
import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { FileNodeNotFoundError } from '../../errors/file-tree/file-node-not-found';
import { DomainError } from '../../errors/domain-error';

/** Outcome of a combined membership + file-node lookup. */
export type MemberAndFileNodeResult =
  | { success: true; fileNode: FileNode }
  | { success: false; error: DomainError };

/**
 * Validates that the actor is a project member and that the requested file node
 * exists and belongs to the project.  Returns the file node on success or a
 * typed error result on failure, matching the Result<T, DomainError> pattern
 * used across all content use cases.
 */
export async function requireMemberAndFileNode(
  projectMemberRepo: ProjectMemberRepository,
  fileNodeRepo: FileNodeRepository,
  projectId: ProjectId,
  actorId: UserId,
  fileNodeId: FileNodeId,
): Promise<MemberAndFileNodeResult> {
  const member = await projectMemberRepo.findByCompositeKey(projectId, actorId);
  if (!member) {
    return { success: false, error: new PermissionDeniedError() };
  }

  const fileNode = await fileNodeRepo.findById(fileNodeId);
  if (!fileNode || fileNode.projectId.value !== projectId.value) {
    return { success: false, error: new FileNodeNotFoundError(fileNodeId.value) };
  }

  return { success: true, fileNode };
}
