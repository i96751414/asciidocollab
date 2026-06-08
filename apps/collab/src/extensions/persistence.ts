import { createRequire } from 'node:module';
import {
  YjsStateStore,
  ProjectFileStore,
  DocumentRepository,
  FileNodeRepository,
  FilePath,
  YjsStateId,
} from '@asciidocollab/domain';
import { parseRoomName } from '../server';

interface Yjs {
  applyUpdate(document: object, update: Uint8Array): void;
  encodeStateAsUpdate(document: object): Uint8Array;
}
const Y: Yjs = createRequire(__filename)('yjs');

interface YjsDocument {
  getText(name: string): { insert(index: number, content: string): void; toString(): string };
}

interface LoadPayload {
  documentName: string;
  document: YjsDocument;
  context: Record<string, unknown>;
}

interface StorePayload {
  documentName: string;
  document: YjsDocument;
  context: Record<string, unknown>;
}

/** Hocuspocus extension that persists Yjs state and syncs file content. */
export class PersistenceExtension {
  /** Creates a PersistenceExtension wired to the given repositories and stores. */
  constructor(
    private readonly yjsStateStore: YjsStateStore,
    private readonly projectFileStore: ProjectFileStore,
    private readonly documentRepo: DocumentRepository,
    private readonly fileNodeRepo: FileNodeRepository,
  ) {}

  private async resolveFilePath(yjsStateId: YjsStateId): Promise<FilePath | null> {
    const document = await this.documentRepo.findByYjsStateId(yjsStateId);
    if (!document) return null;
    const fileNode = await this.fileNodeRepo.findById(document.fileNodeId);
    return fileNode?.path ?? null;
  }

  /** Loads existing Yjs state or bootstraps from file content on first open. */
  async onLoadDocument({ documentName, document }: LoadPayload): Promise<void> {
    const { projectId, yjsStateId } = parseRoomName(documentName);
    const state = await this.yjsStateStore.load(projectId, yjsStateId);
    if (state) {
      Y.applyUpdate(document, state);
      return;
    }

    const filePath = await this.resolveFilePath(yjsStateId);
    if (!filePath) return;

    const content = await this.projectFileStore.read(projectId, filePath);
    if (!content) return;

    document.getText('codemirror').insert(0, content.toString('utf8'));
    const initialState = Buffer.from(Y.encodeStateAsUpdate(document));
    await this.yjsStateStore.save(projectId, yjsStateId, initialState);
  }

  /** Saves Yjs state and syncs codemirror text to file storage (skipped for observers). */
  async onStoreDocument({ documentName, document, context }: StorePayload): Promise<void> {
    if (context.role === 'observer') return;

    const { projectId, yjsStateId } = parseRoomName(documentName);

    const state = Buffer.from(Y.encodeStateAsUpdate(document));
    await this.yjsStateStore.save(projectId, yjsStateId, state);

    const filePath = await this.resolveFilePath(yjsStateId);
    if (!filePath) return;

    const content = Buffer.from(document.getText('codemirror').toString(), 'utf8');
    await this.projectFileStore.write(projectId, filePath, content);
  }
}
