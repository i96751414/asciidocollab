import { startOrphanedRoomWatchdog } from '../src/watchdog';
import type { DocumentRepository } from '@asciidocollab/domain';

const projectId = '550e8400-e29b-41d4-a716-446655440001';
const yjsStateId = '550e8400-e29b-41d4-a716-446655440002';
const roomName = `${projectId}/${yjsStateId}`;

describe('startOrphanedRoomWatchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('destroys room when document no longer exists in DocumentRepository', async () => {
    const mockDestroy = jest.fn();
    const server = {
      documents: new Map([[roomName, { destroy: mockDestroy }]]),
    };

    const documentRepo = {
      findByYjsStateId: jest.fn().mockResolvedValue(null),
    } as unknown as DocumentRepository;

    const interval = startOrphanedRoomWatchdog(server, documentRepo, 100);

    jest.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    clearInterval(interval);

    expect(documentRepo.findByYjsStateId).toHaveBeenCalledWith(
      expect.objectContaining({ value: yjsStateId }),
    );
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('skips room silently when room name has no slash (invalid format)', async () => {
    const mockDestroy = jest.fn();
    const server = {
      documents: new Map([['invalidRoomName', { destroy: mockDestroy }]]),
    };

    const documentRepo = {
      findByYjsStateId: jest.fn().mockResolvedValue(null),
    } as unknown as DocumentRepository;

    const interval = startOrphanedRoomWatchdog(server, documentRepo, 100);

    jest.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    clearInterval(interval);

    // Invalid room name is skipped before DB lookup — no destroy, no DB call.
    expect(documentRepo.findByYjsStateId).not.toHaveBeenCalled();
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it('does not destroy room and logs error when DB lookup throws', async () => {
    const mockDestroy = jest.fn();
    const server = {
      documents: new Map([[roomName, { destroy: mockDestroy }]]),
    };
    const dbError = new Error('connection timeout');
    const documentRepo = {
      findByYjsStateId: jest.fn().mockRejectedValue(dbError),
    } as unknown as DocumentRepository;

    const interval = startOrphanedRoomWatchdog(server, documentRepo, 100);

    jest.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    clearInterval(interval);

    // Room must not be destroyed on a transient DB error.
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it('does not destroy room when document still exists', async () => {
    const mockDestroy = jest.fn();
    const server = {
      documents: new Map([[roomName, { destroy: mockDestroy }]]),
    };

    const documentRepo = {
      findByYjsStateId: jest.fn().mockResolvedValue({ id: { value: 'some-id' } }),
    } as unknown as DocumentRepository;

    const interval = startOrphanedRoomWatchdog(server, documentRepo, 100);

    jest.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    clearInterval(interval);

    expect(mockDestroy).not.toHaveBeenCalled();
  });
});
