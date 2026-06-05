import { ProjectFileStore } from '../../../src/ports/storage/project-file-store';
import { ProjectId } from '../../../src/value-objects/project-id';
import { FilePath } from '../../../src/value-objects/file-path';
import { FileConflictError } from '../../../src/errors/file-conflict';
import { Result } from '../../../src/types/result';

/** In-memory implementation of ProjectFileStore for domain unit tests. */
export class InMemoryProjectFileStore implements ProjectFileStore {
  private readonly storage = new Map<string, Buffer>();

  private key(projectId: ProjectId, filePath: FilePath): string {
    return `${projectId.value}:${filePath.value}`;
  }

  async read(projectId: ProjectId, filePath: FilePath): Promise<Buffer | null> {
    return this.storage.get(this.key(projectId, filePath)) ?? null;
  }

  async write(projectId: ProjectId, filePath: FilePath, content: Buffer): Promise<void> {
    this.storage.set(this.key(projectId, filePath), content);
  }

  async createExclusive(projectId: ProjectId, filePath: FilePath, content: Buffer): Promise<Result<void, FileConflictError>> {
    const k = this.key(projectId, filePath);
    if (this.storage.has(k)) {
      return { success: false, error: new FileConflictError(`File already exists at ${filePath.value}`) };
    }
    this.storage.set(k, content);
    return { success: true, value: undefined };
  }

  async remove(projectId: ProjectId, filePath: FilePath): Promise<void> {
    this.storage.delete(this.key(projectId, filePath));
  }

  async move(projectId: ProjectId, fromPath: FilePath, toPath: FilePath): Promise<Result<void, FileConflictError>> {
    const fromKey = this.key(projectId, fromPath);
    const toKey = this.key(projectId, toPath);
    if (this.storage.has(toKey)) {
      return { success: false, error: new FileConflictError(`File already exists at ${toPath.value}`) };
    }
    const content = this.storage.get(fromKey);
    if (content !== undefined) {
      this.storage.set(toKey, content);
      this.storage.delete(fromKey);
    }
    return { success: true, value: undefined };
  }

  async createDirectory(_projectId: ProjectId, _directoryPath: FilePath): Promise<void> {
    // Directories are implicit in the in-memory store; no-op.
  }

  async removeDirectory(projectId: ProjectId, directoryPath: FilePath): Promise<void> {
    const prefix = `${projectId.value}:${directoryPath.value}`;
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) {
        this.storage.delete(key);
      }
    }
  }

  async removeProject(projectId: ProjectId): Promise<void> {
    const prefix = `${projectId.value}:`;
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) {
        this.storage.delete(key);
      }
    }
  }
}
