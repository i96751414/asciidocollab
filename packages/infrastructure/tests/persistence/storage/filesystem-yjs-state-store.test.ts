import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilesystemYjsStateStore } from '../../../src/persistence/storage/filesystem-yjs-state-store';
import { ProjectId, YjsStateId } from '@asciidocollab/domain';

describe('FilesystemYjsStateStore', () => {
  let storageRoot: string;
  let store: FilesystemYjsStateStore;
  const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440001');
  const yjsStateId = YjsStateId.create('660e8400-e29b-41d4-a716-446655440002');
  const state = Buffer.from([1, 2, 3, 4, 5]);

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'asciidocollab-yjs-test-'));
    store = new FilesystemYjsStateStore(storageRoot);
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('load returns null when file does not exist', async () => {
    const result = await store.load(projectId, yjsStateId);
    expect(result).toBeNull();
  });

  it('save then load roundtrip', async () => {
    await store.save(projectId, yjsStateId, state);
    const result = await store.load(projectId, yjsStateId);
    expect(result).toEqual(state);
  });

  it('save creates .collab/ directory on first use', async () => {
    await expect(store.save(projectId, yjsStateId, state)).resolves.not.toThrow();
    const result = await store.load(projectId, yjsStateId);
    expect(result).not.toBeNull();
  });

  it('delete removes the file', async () => {
    await store.save(projectId, yjsStateId, state);
    await store.delete(projectId, yjsStateId);
    const result = await store.load(projectId, yjsStateId);
    expect(result).toBeNull();
  });

  it('deleteAllForProject removes .collab/ dir', async () => {
    const yjsStateId2 = YjsStateId.create('770e8400-e29b-41d4-a716-446655440003');
    await store.save(projectId, yjsStateId, state);
    await store.save(projectId, yjsStateId2, Buffer.from([6, 7, 8]));
    await store.deleteAllForProject(projectId);
    expect(await store.load(projectId, yjsStateId)).toBeNull();
    expect(await store.load(projectId, yjsStateId2)).toBeNull();
  });
});
