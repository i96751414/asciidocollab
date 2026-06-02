import { mkdir, readFile, writeFile, rename, rm, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { ProjectFileStore } from '@asciidocollab/domain';
import { ProjectId, FilePath, FileConflictError } from '@asciidocollab/domain';
import { Result } from '@asciidocollab/domain';

/** Filesystem implementation of ProjectFileStore. Files are stored under storageRoot/<projectId>/. */
export class FilesystemProjectFileStore implements ProjectFileStore {
  /** Initializes the store with the root directory for all project files. */
  constructor(private readonly storageRoot: string) {}

  private projectDirectory(projectId: ProjectId): string {
    return path.join(this.storageRoot, projectId.value);
  }

  private resolveSafe(projectId: ProjectId, filePath: FilePath): string {
    const projectDirectory = this.projectDirectory(projectId);
    const resolved = path.resolve(projectDirectory, filePath.value.slice(1));
    if (!resolved.startsWith(projectDirectory + '/') && resolved !== projectDirectory) {
      throw new Error(`Path traversal detected: ${filePath.value}`);
    }
    return resolved;
  }

  /** Reads and returns the file bytes, or null if the file does not exist. */
  async read(projectId: ProjectId, filePath: FilePath): Promise<Buffer | null> {
    const absPath = this.resolveSafe(projectId, filePath);
    try {
      return await readFile(absPath);
    } catch (error: unknown) {
      if (isEnoent(error)) return null;
      throw error;
    }
  }

  /** Atomically overwrites the file at filePath, creating intermediate directories as needed. */
  async write(projectId: ProjectId, filePath: FilePath, content: Buffer): Promise<void> {
    const absPath = this.resolveSafe(projectId, filePath);
    const temporaryPath = `${absPath}.tmp`;
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, absPath);
  }

  /** Creates the file only if it does not yet exist, returning FileConflictError if it is already present. */
  async createExclusive(projectId: ProjectId, filePath: FilePath, content: Buffer): Promise<Result<void, FileConflictError>> {
    const absPath = this.resolveSafe(projectId, filePath);
    await mkdir(path.dirname(absPath), { recursive: true });
    let fh;
    try {
      fh = await open(absPath, 'wx');
      await fh.writeFile(content);
      return { success: true, value: undefined };
    } catch (error: unknown) {
      if (isEexist(error)) {
        return { success: false, error: new FileConflictError(`File already exists at ${filePath.value}`) };
      }
      throw error;
    } finally {
      await fh?.close();
    }
  }

  /** Deletes the file, performing a no-op if the file is already absent. */
  async remove(projectId: ProjectId, filePath: FilePath): Promise<void> {
    const absPath = this.resolveSafe(projectId, filePath);
    try {
      await rm(absPath, { force: true });
    } catch {
      // no-op if missing
    }
  }

  /** Moves a file from fromPath to toPath, returning FileConflictError if toPath already exists. */
  async move(projectId: ProjectId, fromPath: FilePath, toPath: FilePath): Promise<Result<void, FileConflictError>> {
    const absFrom = this.resolveSafe(projectId, fromPath);
    const absTo = this.resolveSafe(projectId, toPath);

    // Check destination does not exist (exclusive move)
    try {
      await stat(absTo);
      return { success: false, error: new FileConflictError(`File already exists at ${toPath.value}`) };
    } catch (error: unknown) {
      if (!isEnoent(error)) throw error;
    }

    await mkdir(path.dirname(absTo), { recursive: true });
    await rename(absFrom, absTo);
    return { success: true, value: undefined };
  }

  /** Creates the directory and all intermediate directories; no-op if it already exists. */
  async createDirectory(projectId: ProjectId, directoryPath: FilePath): Promise<void> {
    const absPath = this.resolveSafe(projectId, directoryPath);
    await mkdir(absPath, { recursive: true });
  }

  /** Recursively removes the directory and all its contents. */
  async removeDirectory(projectId: ProjectId, directoryPath: FilePath): Promise<void> {
    const absPath = this.resolveSafe(projectId, directoryPath);
    await rm(absPath, { recursive: true, force: true });
  }

  /** Removes the entire project directory tree, called on project deletion. */
  async removeProject(projectId: ProjectId): Promise<void> {
    const projectDirectory = this.projectDirectory(projectId);
    await rm(projectDirectory, { recursive: true, force: true });
  }
}

function hasCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && typeof Reflect.get(error, 'code') === 'string';
}

function isEnoent(error: unknown): boolean {
  return hasCode(error) && error.code === 'ENOENT';
}

function isEexist(error: unknown): boolean {
  return hasCode(error) && error.code === 'EEXIST';
}
