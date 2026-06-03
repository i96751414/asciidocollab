import { FileNode } from '../../entities/file-node';
import { FileNodeId } from '../../value-objects/file-node-id';
import { ProjectId } from '../../value-objects/project-id';

/**
 * Repository interface for managing FileNode persistence.
 * Handles storage and retrieval of file/folder tree nodes within projects.
 */
export interface FileNodeRepository {
  /**
   * Finds a file node by its unique identifier.
   * 
   * @param id - The unique identifier of the file node.
   * @returns The file node if found, null otherwise.
   */
  findById(id: FileNodeId): Promise<FileNode | null>;

  /**
   * Finds all direct children of a given parent file node.
   * 
   * @param parentId - The unique identifier of the parent file node.
   * @returns An array of child file nodes.
   */
  findByParentId(parentId: FileNodeId): Promise<FileNode[]>;

  /**
   * Finds all file nodes belonging to a given project.
   * 
   * @param projectId - The unique identifier of the project.
   * @returns An array of file nodes in the project.
   */
  findByProjectId(projectId: ProjectId): Promise<FileNode[]>;

  /**
   * Persists a file node entity (create or update).
   * 
   * @param fileNode - The file node entity to save.
   * @returns A promise that resolves when the operation completes.
   */
  save(fileNode: FileNode): Promise<void>;

  /**
   * Moves a file node to a new parent.
   * 
   * @param id - The unique identifier of the file node to move.
   * @param newParentId - The unique identifier of the new parent file node.
   * @returns A promise that resolves when the operation completes.
   */
  move(id: FileNodeId, newParentId: FileNodeId): Promise<void>;

  /**
   * Removes a file node by its unique identifier.
   * 
   * @param id - The unique identifier of the file node to delete.
   * @returns A promise that resolves when the operation completes.
   */
  delete(id: FileNodeId): Promise<void>;
}
