import { FileNode } from '../../entities/file-node';
import { Timestamps } from '../../value-objects/common/timestamps';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { FilePath } from '../../value-objects/files/file-path';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';

/**
 * Recursively updates the stored path of every descendant of `folderId` after the folder
 * itself has been moved or renamed.  Both the old and new prefixes must include a trailing
 * slash so that sibling names that share a common prefix are not incorrectly matched.
 */
export async function cascadePathUpdate(
  fileNodeRepo: FileNodeRepository,
  folderId: FileNodeId,
  oldPathPrefix: string,
  newPathPrefix: string,
): Promise<void> {
  const children = await fileNodeRepo.findByParentId(folderId);
  for (const child of children) {
    const newChildPath = FilePath.create(newPathPrefix + child.path.value.slice(oldPathPrefix.length));
    const updatedChild = new FileNode(
      child.id,
      child.projectId,
      child.parentId,
      child.name,
      child.type,
      newChildPath,
      new Timestamps(child.createdAt, new Date()),
    );
    await fileNodeRepo.save(updatedChild);
    if (child.type.value === 'folder') {
      await cascadePathUpdate(
        fileNodeRepo,
        child.id,
        oldPathPrefix + child.name + '/',
        newPathPrefix + child.name + '/',
      );
    }
  }
}

/**
 * Computes the path prefix for a child node given its parent's path.
 * The root folder ("/") is its own prefix; other folders append a trailing slash.
 */
export function buildParentPath(parentPathValue: string): string {
  return parentPathValue === '/' ? '/' : `${parentPathValue}/`;
}
