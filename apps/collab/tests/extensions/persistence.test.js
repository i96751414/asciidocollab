"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_module_1 = require("node:module");
const persistence_1 = require("../../src/extensions/persistence");
const domain_1 = require("@asciidocollab/domain");
const Y = (0, node_module_1.createRequire)(__filename)('yjs');
function makeDoc() {
    return new Y.Doc();
}
const projectId = domain_1.ProjectId.create('550e8400-e29b-41d4-a716-446655440001');
const yjsStateIdVal = '550e8400-e29b-41d4-a716-446655440002';
const yjsStateId = domain_1.YjsStateId.create(yjsStateIdVal);
const documentName = `${projectId.value}/${yjsStateIdVal}`;
const filePath = domain_1.FilePath.create('/docs/file.adoc');
const fileNodeIdVal = '550e8400-e29b-41d4-a716-446655440003';
function makeStores(options = {}) {
    const yjsStateStore = {
        load: jest.fn().mockResolvedValue(options.yjsState ?? null),
        save: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn(),
        deleteAllForProject: jest.fn(),
    };
    const projectFileStore = {
        read: jest.fn().mockResolvedValue(options.fileContent ?? null),
        write: jest.fn().mockResolvedValue(undefined),
        createExclusive: jest.fn(),
        remove: jest.fn(),
        move: jest.fn(),
        createDirectory: jest.fn(),
        removeDirectory: jest.fn(),
        removeProject: jest.fn(),
        readStream: jest.fn(),
    };
    const testDoc = new domain_1.Document(domain_1.DocumentId.create('550e8400-e29b-41d4-a716-446655440010'), domain_1.FileNodeId.create(fileNodeIdVal), domain_1.ContentId.create('550e8400-e29b-41d4-a716-446655440004'), yjsStateId, domain_1.MimeType.create('text/asciidoc'), new domain_1.Timestamps());
    const testFileNode = new domain_1.FileNode(domain_1.FileNodeId.create(fileNodeIdVal), projectId, domain_1.FileNodeId.create('550e8400-e29b-41d4-a716-446655440020'), 'file.adoc', domain_1.FileNodeType.create('file'), filePath, new domain_1.Timestamps());
    const documentRepository = {
        findByYjsStateId: jest.fn().mockResolvedValue(testDoc),
        findById: jest.fn(),
        findByFileNodeId: jest.fn(),
        findByFileNodeIds: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
    };
    const fileNodeRepository = {
        findById: jest.fn().mockResolvedValue(testFileNode),
        findByParentId: jest.fn(),
        findByProjectId: jest.fn(),
        findByPath: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
        findDescendants: jest.fn(),
        findByProjectIdAndType: jest.fn(),
        deleteAllForProject: jest.fn(),
    };
    return { yjsStateStore, projectFileStore, documentRepository, fileNodeRepository };
}
describe('PersistenceExtension', () => {
    describe('onLoadDocument', () => {
        it('(a) applies existing Yjs state when store has data', async () => {
            const sourceDoc = makeDoc();
            sourceDoc.getText('codemirror').insert(0, 'existing content');
            const existingState = Buffer.from(Y.encodeStateAsUpdate(sourceDoc));
            const { yjsStateStore, projectFileStore, documentRepository, fileNodeRepository } = makeStores({ yjsState: existingState });
            const extension = new persistence_1.PersistenceExtension(yjsStateStore, projectFileStore, documentRepository, fileNodeRepository);
            const doc = makeDoc();
            await extension.onLoadDocument({ documentName, document: doc, context: {} });
            expect(yjsStateStore.load).toHaveBeenCalledWith(expect.objectContaining({ value: projectId.value }), expect.objectContaining({ value: yjsStateIdVal }));
            expect(doc.getText('codemirror').toString()).toBe('existing content');
            expect(projectFileStore.read).not.toHaveBeenCalled();
        });
        it('(b) bootstraps from file content when no Yjs state exists and immediately persists', async () => {
            const fileContent = Buffer.from('# Hello World');
            const { yjsStateStore, projectFileStore, documentRepository, fileNodeRepository } = makeStores({ yjsState: null, fileContent });
            const extension = new persistence_1.PersistenceExtension(yjsStateStore, projectFileStore, documentRepository, fileNodeRepository);
            const doc = makeDoc();
            await extension.onLoadDocument({ documentName, document: doc, context: {} });
            expect(projectFileStore.read).toHaveBeenCalledWith(expect.objectContaining({ value: projectId.value }), expect.objectContaining({ value: filePath.value }));
            expect(doc.getText('codemirror').toString()).toBe('# Hello World');
            expect(yjsStateStore.save).toHaveBeenCalledTimes(1);
        });
        it('(b) does not bootstrap if file content is null', async () => {
            const { yjsStateStore, projectFileStore, documentRepository, fileNodeRepository } = makeStores({ yjsState: null, fileContent: null });
            const extension = new persistence_1.PersistenceExtension(yjsStateStore, projectFileStore, documentRepository, fileNodeRepository);
            const doc = makeDoc();
            await extension.onLoadDocument({ documentName, document: doc, context: {} });
            expect(yjsStateStore.save).not.toHaveBeenCalled();
        });
    });
    describe('onStoreDocument', () => {
        it('(c) writes encoded codemirror text to both YjsStateStore and ProjectFileStore', async () => {
            const { yjsStateStore, projectFileStore, documentRepository, fileNodeRepository } = makeStores();
            const extension = new persistence_1.PersistenceExtension(yjsStateStore, projectFileStore, documentRepository, fileNodeRepository);
            const doc = makeDoc();
            doc.getText('codemirror').insert(0, 'hello world');
            await extension.onStoreDocument({ documentName, document: doc, context: {} });
            expect(yjsStateStore.save).toHaveBeenCalledWith(expect.objectContaining({ value: projectId.value }), expect.objectContaining({ value: yjsStateIdVal }), expect.any(Buffer));
            expect(projectFileStore.write).toHaveBeenCalledWith(expect.objectContaining({ value: projectId.value }), expect.objectContaining({ value: filePath.value }), expect.any(Buffer));
            const writtenContent = projectFileStore.write.mock.calls[0][2];
            expect(writtenContent.toString('utf-8')).toBe('hello world');
        });
        it('(d) observer: does not write to either store when context.role is observer', async () => {
            const { yjsStateStore, projectFileStore, documentRepository, fileNodeRepository } = makeStores();
            const extension = new persistence_1.PersistenceExtension(yjsStateStore, projectFileStore, documentRepository, fileNodeRepository);
            const doc = makeDoc();
            doc.getText('codemirror').insert(0, 'observer should not write');
            await extension.onStoreDocument({ documentName, document: doc, context: { role: 'observer' } });
            expect(yjsStateStore.save).not.toHaveBeenCalled();
            expect(projectFileStore.write).not.toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=persistence.test.js.map