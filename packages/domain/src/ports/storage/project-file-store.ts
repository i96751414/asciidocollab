import type { Readable } from 'stream';
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
   * @returns The file contents, or null if not found.
   */
  read(projectId: ProjectId, filePath: FilePath): Promise<Buffer | null>;

  /**
   * Atomically overwrites the file at filePath. Creates intermediate directories.
   *
   * @param projectId - The project that owns the file.
   * @param filePath - The absolute path of the file within the project.
   * @param content - The new content to write.
   * @returns A promise that resolves when the write is complete.
   */
  write(projectId: ProjectId, filePath: FilePath, content: Buffer): Promise<void>;

  /**
   * Creates the file only if it does not yet exist. Returns FileConflictError if taken.
   *
   * @param projectId - The project that owns the file.
   * @param filePath - The absolute path of the file within the project.
   * @param content - The initial content to write.
   * @returns A successful result, or a FileConflictError if the path is already occupied.
   */
  createExclusive(projectId: ProjectId, filePath: FilePath, content: Buffer): Promise<Result<void, FileConflictError>>;

  /**
   * Deletes the file. No-op if the file does not exist.
   *
   * @param projectId - The project that owns the file.
   * @param filePath - The absolute path of the file within the project.
   * @returns A promise that resolves when the removal is complete.
   */
  remove(projectId: ProjectId, filePath: FilePath): Promise<void>;

  /**
   * Moves or renames a file. Returns FileConflictError if a file already exists at toPath.
   *
   * @param projectId - The project that owns the file.
   * @param fromPath - The current absolute path of the file.
   * @param toPath - The destination absolute path.
   * @returns A successful result, or a FileConflictError if toPath is already occupied.
   */
  move(projectId: ProjectId, fromPath: FilePath, toPath: FilePath): Promise<Result<void, FileConflictError>>;

  /**
   * Creates the directory and all intermediate directories. No-op if already exists.
   *
   * @param projectId - The project that owns the directory.
   * @param directoryPath - The absolute path of the directory to create.
   * @returns A promise that resolves when the directory exists.
   */
  createDirectory(projectId: ProjectId, directoryPath: FilePath): Promise<void>;

  /**
   * Recursively removes the directory and all contents.
   *
   * @param projectId - The project that owns the directory.
   * @param directoryPath - The absolute path of the directory to remove.
   * @returns A promise that resolves when the directory has been removed.
   */
  removeDirectory(projectId: ProjectId, directoryPath: FilePath): Promise<void>;

  /**
   * Removes the entire project directory tree (called on project deletion).
   *
   * @param projectId - The project whose storage tree should be deleted.
   * @returns A promise that resolves when the project tree has been removed.
   */
  removeProject(projectId: ProjectId): Promise<void>;

  /**
   * Returns a readable stream for the file, or null if the file does not exist.
   * Used for streaming downloads — no file content is buffered in memory.
   *
   * @param projectId - The project that owns the file.
   * @param filePath - The path of the file within the project.
   * @returns A Readable stream, or null if the file is not found.
   */
  readStream(projectId: ProjectId, filePath: FilePath): Promise<Readable | null>;
}
