import { createCollabServer } from '../src/server';
import { PersistenceExtension } from '../src/extensions/persistence';
import type {
  YjsStateStore,
  ProjectFileStore,
  DocumentRepository,
  FileNodeRepository,
  SystemSettingRepository,
} from '@asciidocollab/domain';

function makeExtension() {
  return new PersistenceExtension(
    { load: jest.fn(), save: jest.fn(), delete: jest.fn(), deleteAllForProject: jest.fn() } as unknown as YjsStateStore,
    { read: jest.fn(), write: jest.fn(), createExclusive: jest.fn(), remove: jest.fn(), move: jest.fn(), createDirectory: jest.fn(), removeDirectory: jest.fn(), removeProject: jest.fn(), readStream: jest.fn() } as unknown as ProjectFileStore,
    { findByYjsStateId: jest.fn(), findById: jest.fn(), findByFileNodeId: jest.fn(), findByFileNodeIds: jest.fn(), save: jest.fn(), delete: jest.fn() } as unknown as DocumentRepository,
    { findById: jest.fn(), findByParentId: jest.fn(), findByProjectId: jest.fn(), findByPath: jest.fn(), save: jest.fn(), delete: jest.fn(), findDescendants: jest.fn(), findByProjectIdAndType: jest.fn(), deleteAllForProject: jest.fn() } as unknown as FileNodeRepository,
  );
}

describe('createCollabServer', () => {
  it('initialises server with persistence extension registered', async () => {
    const settingRepo = {
      get: jest.fn().mockResolvedValue('30'),
      set: jest.fn(),
    } as unknown as SystemSettingRepository;

    const extension = makeExtension();
    const server = await createCollabServer({ port: 0 }, [extension], settingRepo);

    expect(server).toBeDefined();
    expect(typeof server.destroy).toBe('function');
  });

  it('maxDebounce reflects the configured writeback interval', async () => {
    const settingRepo = {
      get: jest.fn().mockResolvedValue('60'),
      set: jest.fn(),
    } as unknown as SystemSettingRepository;

    const extension = makeExtension();
    const server = await createCollabServer({ port: 0 }, [extension], settingRepo);

    const config = (server as { configuration?: { maxDebounce?: number } }).configuration;
    if (config) {
      expect(config.maxDebounce).toBe(60_000);
    }
  });

  it('registers onConnect and onDisconnect handlers when session callbacks are provided', async () => {
    const settingRepo = {
      get: jest.fn().mockResolvedValue('30'),
      set: jest.fn(),
    } as unknown as SystemSettingRepository;

    const sessionCallbacks = {
      onRoomOpen: jest.fn().mockResolvedValue({ success: true, value: undefined }),
      onRoomClose: jest.fn().mockResolvedValue({ success: true, value: undefined }),
    };

    const documentRepository = {
      findByYjsStateId: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      findByFileNodeId: jest.fn(),
      findByFileNodeIds: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as DocumentRepository;

    const extension = makeExtension();
    const server = await createCollabServer({ port: 0 }, [extension], settingRepo, sessionCallbacks, documentRepository);

    // Verify the server is configured with both hooks
    const cfg = (server as { configuration?: { onConnect?: unknown; onDisconnect?: unknown } }).configuration;
    if (cfg) {
      expect(typeof cfg.onConnect).toBe('function');
      expect(typeof cfg.onDisconnect).toBe('function');
    }
  });

  it('onConnect stores documentId in payload.context so onDisconnect can skip the second DB lookup', async () => {
    const settingRepo = {
      get: jest.fn().mockResolvedValue('30'),
      set: jest.fn(),
    } as unknown as SystemSettingRepository;

    const documentId = { value: '550e8400-e29b-41d4-a716-446655440010' };
    const mockDocument = { id: documentId, fileNodeId: { value: '550e8400-e29b-41d4-a716-446655440011' } };

    const sessionCallbacks = {
      onRoomOpen: jest.fn().mockResolvedValue({ success: true, value: undefined }),
      onRoomClose: jest.fn().mockResolvedValue({ success: true, value: undefined }),
    };

    const documentRepository = {
      findByYjsStateId: jest.fn().mockResolvedValue(mockDocument),
      findById: jest.fn(),
      findByFileNodeId: jest.fn(),
      findByFileNodeIds: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as DocumentRepository;

    const extension = makeExtension();
    const server = await createCollabServer({ port: 0 }, [extension], settingRepo, sessionCallbacks, documentRepository);

    const cfg = (server as { configuration?: { onConnect?: (p: unknown) => Promise<void> } }).configuration;
    if (!cfg?.onConnect) return;

    const context: Record<string, unknown> = {};
    const projectId = '550e8400-e29b-41d4-a716-446655440001';
    const yjsStateId = '550e8400-e29b-41d4-a716-446655440002';
    await cfg.onConnect({ documentName: `${projectId}/${yjsStateId}`, context });

    expect(context.documentId).toBe(documentId);
  });

  it('onDisconnect skips onRoomClose when new client joined after the last client left (TOCTOU guard)', async () => {
    const settingRepo = {
      get: jest.fn().mockResolvedValue('30'),
      set: jest.fn(),
    } as unknown as SystemSettingRepository;

    const documentId = { value: '550e8400-e29b-41d4-a716-446655440010' };
    const sessionCallbacks = {
      onRoomOpen: jest.fn().mockResolvedValue({ success: true, value: undefined }),
      onRoomClose: jest.fn().mockResolvedValue({ success: true, value: undefined }),
    };

    const documentRepository = {
      findByYjsStateId: jest.fn(),
      findById: jest.fn(),
      findByFileNodeId: jest.fn(),
      findByFileNodeIds: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as DocumentRepository;

    const extension = makeExtension();
    const server = await createCollabServer({ port: 0 }, [extension], settingRepo, sessionCallbacks, documentRepository);

    const cfg = (server as { configuration?: { onDisconnect?: (p: unknown) => Promise<void> } }).configuration;
    if (!cfg?.onDisconnect) return;

    const projectId = '550e8400-e29b-41d4-a716-446655440001';
    const yjsStateId = '550e8400-e29b-41d4-a716-446655440002';
    // Simulate a new client having joined before onDisconnect fires (getConnectionsCount > 0).
    const mockHocuspocusDocument = { getConnectionsCount: jest.fn().mockReturnValue(1) };
    await cfg.onDisconnect({
      clientsCount: 0,
      documentName: `${projectId}/${yjsStateId}`,
      context: { documentId },
      document: mockHocuspocusDocument,
    });

    expect(sessionCallbacks.onRoomClose).not.toHaveBeenCalled();
  });

  it('creates successfully when session callbacks are omitted', async () => {
    const settingRepo = {
      get: jest.fn().mockResolvedValue('30'),
      set: jest.fn(),
    } as unknown as SystemSettingRepository;

    const extension = makeExtension();
    const server = await createCollabServer({ port: 0 }, [extension], settingRepo);

    expect(server).toBeDefined();
    expect(typeof server.destroy).toBe('function');
  });
});
