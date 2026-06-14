import { YjsStateStore } from '../../../src/ports/storage/yjs-state-store';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { YjsStateId } from '../../../src/value-objects/ids/yjs-state-id';

/** In-memory implementation of YjsStateStore for domain unit tests. */
export class InMemoryYjsStateStore implements YjsStateStore {
  private readonly storage = new Map<string, Buffer>();

  private key(projectId: ProjectId, yjsStateId: YjsStateId): string {
    return `${projectId.value}:${yjsStateId.value}`;
  }

  async load(projectId: ProjectId, yjsStateId: YjsStateId): Promise<Buffer | null> {
    return this.storage.get(this.key(projectId, yjsStateId)) ?? null;
  }

  async save(projectId: ProjectId, yjsStateId: YjsStateId, state: Buffer): Promise<void> {
    this.storage.set(this.key(projectId, yjsStateId), state);
  }

  async delete(projectId: ProjectId, yjsStateId: YjsStateId): Promise<void> {
    this.storage.delete(this.key(projectId, yjsStateId));
  }

  async deleteAllForProject(projectId: ProjectId): Promise<void> {
    const prefix = `${projectId.value}:`;
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) {
        this.storage.delete(key);
      }
    }
  }
}
