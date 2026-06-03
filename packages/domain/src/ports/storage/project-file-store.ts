import { ProjectId } from '../../value-objects/project-id';
import { FilePath } from '../../value-objects/file-path';
import { FileConflictError } from '../../errors/file-conflict';
import { Result } from '../../types/result';

/** Port for reading and writing user-visible project files on the filesystem. */
export interface ProjectFileStore {
  /**
   * Returns file bytes, or null if the file does not exist.
   *
   * @param projectId - The project that owns the file.
   * @param filePath - The absolute path of the file within the project.
   */
  read(projectId: ProjectId, filePath: FilePath): Promise<Buffer | null>;

  /**
   * Atomically overwrites the file at filePath. Creates intermediate directories.
   *
   * @param projectId - The project that owns the file.
   * @param filePath - The absolute path of the file within the project.
   * @param content - The new content to write.
   */
  write(projectId: ProjectId, filePath: FilePath, content: Buffer): Promise<void>;

  /**
   * Creates the file only if it does not yet exist. Returns FileConflictError if taken.
   *
   * @param projectId - The project that owns the file.
   * @param filePath - The absolute path of the file within the project.
   * @param content - The initial content to write.
   */
  createExclusive(projectId: ProjectId, filePath: FilePath, content: Buffer): Promise<Result<void, FileConflictError>>;

  /**
   * Deletes the file. No-op if the file does not exist.
   *
   * @param projectId - The project that owns the file.
   * @param filePath - The absolute path of the file within the project.
   */
  remove(projectId: ProjectId, filePath: FilePath): Promise<void>;

  /**
   * Moves or renames a file. Returns FileConflictError if a file already exists at toPath.
   *
   * @param projectId - The project that owns the file.
   * @param fromPath - The current absolute path of the file.
   * @param toPath - The destination absolute path.
   */
  move(projectId: ProjectId, fromPath: FilePath, toPath: FilePath): Promise<Result<void, FileConflictError>>;

  /**
   * Creates the directory and all intermediate directories. No-op if already exists.
   *
   * @param projectId - The project that owns the directory.
   * @param directoryPath - The absolute path of the directory to create.
   */
  createDirectory(projectId: ProjectId, directoryPath: FilePath): Promise<void>;

  /**
   * Recursively removes the directory and all contents.
   *
   * @param projectId - The project that owns the directory.
   * @param directoryPath - The absolute path of the directory to remove.
   */
  removeDirectory(projectId: ProjectId, directoryPath: FilePath): Promise<void>;

  /**
   * Removes the entire project directory tree (called on project deletion).
   *
   * @param projectId - The project whose storage tree should be deleted.
   */
  removeProject(projectId: ProjectId): Promise<void>;
}
