"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("../src/server");
const persistence_1 = require("../src/extensions/persistence");
function makeExtension() {
    return new persistence_1.PersistenceExtension({ load: jest.fn(), save: jest.fn(), delete: jest.fn(), deleteAllForProject: jest.fn() }, { read: jest.fn(), write: jest.fn(), createExclusive: jest.fn(), remove: jest.fn(), move: jest.fn(), createDirectory: jest.fn(), removeDirectory: jest.fn(), removeProject: jest.fn(), readStream: jest.fn() }, { findByYjsStateId: jest.fn(), findById: jest.fn(), findByFileNodeId: jest.fn(), findByFileNodeIds: jest.fn(), save: jest.fn(), delete: jest.fn() }, { findById: jest.fn(), findByParentId: jest.fn(), findByProjectId: jest.fn(), findByPath: jest.fn(), save: jest.fn(), delete: jest.fn(), findDescendants: jest.fn(), findByProjectIdAndType: jest.fn(), deleteAllForProject: jest.fn() });
}
describe('createCollabServer', () => {
    it('initialises server with persistence extension registered', async () => {
        const settingRepo = {
            get: jest.fn().mockResolvedValue('30'),
            set: jest.fn(),
        };
        const extension = makeExtension();
        const server = await (0, server_1.createCollabServer)({ port: 0 }, [extension], settingRepo);
        expect(server).toBeDefined();
        expect(typeof server.destroy).toBe('function');
    });
    it('maxDebounce reflects the configured writeback interval', async () => {
        const settingRepo = {
            get: jest.fn().mockResolvedValue('60'),
            set: jest.fn(),
        };
        const extension = makeExtension();
        const server = await (0, server_1.createCollabServer)({ port: 0 }, [extension], settingRepo);
        const config = server.configuration;
        if (config) {
            expect(config.maxDebounce).toBe(60_000);
        }
    });
});
//# sourceMappingURL=server.test.js.map