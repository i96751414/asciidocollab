"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const watchdog_1 = require("../src/watchdog");
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
        };
        const interval = (0, watchdog_1.startOrphanedRoomWatchdog)(server, documentRepo, 100);
        jest.advanceTimersByTime(150);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        clearInterval(interval);
        expect(documentRepo.findByYjsStateId).toHaveBeenCalledWith(expect.objectContaining({ value: yjsStateId }));
        expect(mockDestroy).toHaveBeenCalledTimes(1);
    });
    it('does not destroy room when document still exists', async () => {
        const mockDestroy = jest.fn();
        const server = {
            documents: new Map([[roomName, { destroy: mockDestroy }]]),
        };
        const documentRepo = {
            findByYjsStateId: jest.fn().mockResolvedValue({ id: { value: 'some-id' } }),
        };
        const interval = (0, watchdog_1.startOrphanedRoomWatchdog)(server, documentRepo, 100);
        jest.advanceTimersByTime(150);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        clearInterval(interval);
        expect(mockDestroy).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=watchdog.test.js.map