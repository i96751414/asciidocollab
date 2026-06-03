import * as Y from 'yjs';
import { encodeStateAsUpdate } from 'yjs';
import { HocuspocusPersistenceExtension } from '../../src/plugins/hocuspocus-persistence';
import { YjsStateStore, ProjectId, YjsStateId } from '@asciidocollab/domain';

/** Minimal in-memory YjsStateStore for this test. */
class FakeYjsStateStore implements YjsStateStore {
  private readonly storage = new Map<string, Buffer>();
  private key(p: ProjectId, s: YjsStateId) { return `${p.value}:${s.value}`; }
  async load(p: ProjectId, s: YjsStateId) { return this.storage.get(this.key(p, s)) ?? null; }
  async save(p: ProjectId, s: YjsStateId, state: Buffer) { this.storage.set(this.key(p, s), state); }
  async delete(p: ProjectId, s: YjsStateId) { this.storage.delete(this.key(p, s)); }
  async deleteAllForProject(p: ProjectId) {
    for (const k of this.storage.keys()) {
      if (k.startsWith(`${p.value}:`)) this.storage.delete(k);
    }
  }
}

const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440001');
const yjsStateId = YjsStateId.create('660e8400-e29b-41d4-a716-446655440002');
const documentName = `${projectId.value}/${yjsStateId.value}`;

describe('HocuspocusPersistenceExtension', () => {
  let yjsStateStore: FakeYjsStateStore;
  let extension: HocuspocusPersistenceExtension;

  beforeEach(() => {
    yjsStateStore = new FakeYjsStateStore();
    extension = new HocuspocusPersistenceExtension(yjsStateStore);
  });

  it('onLoadDocument is a no-op when no state exists', async () => {
    const document = new Y.Doc();
    await extension.onLoadDocument({ documentName, document: document } as Parameters<HocuspocusPersistenceExtension['onLoadDocument']>[0]);
    expect(document.getArray('test').length).toBe(0);
  });

  it('onLoadDocument applies previously saved state', async () => {
    const savedDocument = new Y.Doc();
    savedDocument.getArray('test').push(['hello']);
    const state = Buffer.from(encodeStateAsUpdate(savedDocument));
    await yjsStateStore.save(projectId, yjsStateId, state);

    const document = new Y.Doc();
    await extension.onLoadDocument({ documentName, document: document } as Parameters<HocuspocusPersistenceExtension['onLoadDocument']>[0]);
    expect(document.getArray('test').toArray()).toEqual(['hello']);
  });

  it('onStoreDocument calls yjsStateStore.save with correct projectId and yjsStateId', async () => {
    const document = new Y.Doc();
    document.getArray('test').push(['world']);

    await extension.onStoreDocument({ documentName, document: document } as Parameters<HocuspocusPersistenceExtension['onStoreDocument']>[0]);

    const stored = await yjsStateStore.load(projectId, yjsStateId);
    expect(stored).not.toBeNull();
  });

  it('state round-trips correctly', async () => {
    const original = new Y.Doc();
    original.getArray('data').push(['foo', 'bar']);

    await extension.onStoreDocument({ documentName, document: original } as Parameters<HocuspocusPersistenceExtension['onStoreDocument']>[0]);

    const loaded = new Y.Doc();
    await extension.onLoadDocument({ documentName, document: loaded } as Parameters<HocuspocusPersistenceExtension['onLoadDocument']>[0]);

    expect(loaded.getArray('data').toArray()).toEqual(['foo', 'bar']);
  });
});
