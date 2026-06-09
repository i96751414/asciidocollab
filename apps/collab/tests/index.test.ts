describe('apps/collab graceful shutdown', () => {
  let mockServer: { destroy: jest.Mock; listen: jest.Mock; documents: Map<string, unknown> };
  let mockCollaborationSessionRepo: { closeAll: jest.Mock };
  let mockPrisma: { $disconnect: jest.Mock };
  let shutdownFns: Array<() => Promise<void>>;
  beforeEach(() => {
    jest.resetModules();

    shutdownFns = [];
    mockServer = {
      destroy: jest.fn().mockResolvedValue(undefined),
      listen: jest.fn().mockResolvedValue(undefined),
      documents: new Map(),
    };
    mockCollaborationSessionRepo = { closeAll: jest.fn().mockResolvedValue(undefined) };
    mockPrisma = { $disconnect: jest.fn().mockResolvedValue(undefined) };

    jest.mock('../src/composition-root', () => ({
      compositionRoot: jest.fn().mockResolvedValue({
        server: mockServer,
        collaborationSessionRepo: mockCollaborationSessionRepo,
        prisma: mockPrisma,
        documentRepository: { findByYjsStateId: jest.fn() },
        config: { get: jest.fn().mockReturnValue(0) },
        mtlsFetch: undefined,
      }),
    }));
    // This suite exercises the shutdown sequence, not storage; stub the startup storage check.
    jest.mock('../src/storage-probe', () => ({ verifySharedStorage: jest.fn().mockResolvedValue(undefined) }));
    jest.spyOn(process, 'on').mockImplementation((event: string, handler: (...arguments_: unknown[]) => void) => {
      if (event === 'SIGTERM' || event === 'SIGINT') {
        shutdownFns.push(handler as () => Promise<void>);
      }
      return process;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('shutdown sequence: destroy → closeAll → $disconnect', async () => {
    require('../src/index');
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(shutdownFns.length).toBeGreaterThan(0);

    await shutdownFns[0]();

    const destroyOrder = mockServer.destroy.mock.invocationCallOrder[0];
    const closeAllOrder = mockCollaborationSessionRepo.closeAll.mock.invocationCallOrder[1];
    const disconnectOrder = mockPrisma.$disconnect.mock.invocationCallOrder[0];

    expect(mockServer.destroy).toHaveBeenCalledTimes(1);
    expect(mockCollaborationSessionRepo.closeAll).toHaveBeenCalledTimes(2);
    expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);

    if (destroyOrder && closeAllOrder && disconnectOrder) {
      expect(destroyOrder).toBeLessThan(closeAllOrder);
      expect(closeAllOrder).toBeLessThan(disconnectOrder);
    }
  });
});
