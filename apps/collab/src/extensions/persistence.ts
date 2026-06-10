import * as Y from 'yjs';
import {
  YjsStateStore,
  ProjectFileStore,
  DocumentRepository,
  FileNodeRepository,
  FilePath,
  YjsStateId,
} from '@asciidocollab/domain';
import { parseRoomName } from '../server.js';

// Hocuspocus delivers a `Y.Doc` (its `Document` extends `Y.Doc`) to the load/store hooks. A single
// resolved yjs version (SC-004) guarantees this is the same Y instance, so a normal ESM import
// replaces the prior `createRequire('yjs')` CJS workaround.
interface LoadPayload {
  documentName: string;
  document: Y.Doc;
}

interface StorePayload {
  documentName: string;
  document: Y.Doc;
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

  /**
   * Saves Yjs state and syncs codemirror text to file storage. Observer writes are blocked at the
   * transport layer (the auth hook sets `connectionConfig.readOnly`), NOT here: onStoreDocument is a
   * document-level hook whose `context` does not reliably identify the writing connection, so
   * gating on `context.role` would risk silently dropping a legitimate editor's edits in a mixed
   * (editor + observer) room.
   */
  async onStoreDocument({ documentName, document }: StorePayload): Promise<void> {
    const { projectId, yjsStateId } = parseRoomName(documentName);

    // Resolve the backing document FIRST. If it no longer exists (the file was deleted while its
    // room was still open), skip every write — re-saving the Yjs state blob here would resurrect
    // storage the delete just removed, leaving an orphan with no cleanup path.
    const filePath = await this.resolveFilePath(yjsStateId);
    if (!filePath) return;

    const state = Buffer.from(Y.encodeStateAsUpdate(document));
    await this.yjsStateStore.save(projectId, yjsStateId, state);

    const content = Buffer.from(document.getText('codemirror').toString(), 'utf8');
    await this.projectFileStore.write(projectId, filePath, content);
  }
}
