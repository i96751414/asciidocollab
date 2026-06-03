import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { YjsStateStore } from '@asciidocollab/domain';
import { ProjectId, YjsStateId } from '@asciidocollab/domain';

/** Filesystem implementation of YjsStateStore. States stored under storageRoot/<projectId>/.collab/<yjsStateId>. */
export class FilesystemYjsStateStore implements YjsStateStore {
  /** Initializes the store with the root directory under which project state directories are created. */
  constructor(private readonly storageRoot: string) {}

  private collabDirectory(projectId: ProjectId): string {
    return path.join(this.storageRoot, projectId.value, '.collab');
  }

  private statePath(projectId: ProjectId, yjsStateId: YjsStateId): string {
    return path.join(this.collabDirectory(projectId), yjsStateId.value);
  }

  /** Loads persisted Yjs state bytes for the given project document, returning null if none exist. */
  async load(projectId: ProjectId, yjsStateId: YjsStateId): Promise<Buffer | null> {
    const statePath = this.statePath(projectId, yjsStateId);
    try {
      return await readFile(statePath);
    } catch (error: unknown) {
      if (isEnoent(error)) return null;
      throw error;
    }
  }

  /** Saves Yjs state bytes for the given project document, creating the storage directory on first use. */
  async save(projectId: ProjectId, yjsStateId: YjsStateId, state: Buffer): Promise<void> {
    const collabDirectory = this.collabDirectory(projectId);
    await mkdir(collabDirectory, { recursive: true });
    const statePath = this.statePath(projectId, yjsStateId);
    await writeFile(statePath, state);
  }

  /** Removes the state file for a single document. */
  async delete(projectId: ProjectId, yjsStateId: YjsStateId): Promise<void> {
    const statePath = this.statePath(projectId, yjsStateId);
    await rm(statePath, { force: true });
  }

  /** Removes all Yjs states for the project, called on project deletion. */
  async deleteAllForProject(projectId: ProjectId): Promise<void> {
    const collabDirectory = this.collabDirectory(projectId);
    await rm(collabDirectory, { recursive: true, force: true });
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && Reflect.get(error, 'code') === 'ENOENT';
}
