import { Extension, onLoadDocumentPayload, onStoreDocumentPayload } from '@hocuspocus/server';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';
import { YjsStateStore, ProjectId, YjsStateId } from '@asciidocollab/domain';

/** Hocuspocus extension that persists Yjs document state via YjsStateStore. */
export class HocuspocusPersistenceExtension implements Extension {
  /** Initializes the extension with the Yjs state store used for persistence. */
  constructor(private readonly yjsStateStore: YjsStateStore) {}

  /** Loads persisted Yjs state into the document when it is first opened. */
  async onLoadDocument(data: onLoadDocumentPayload): Promise<void> {
    const [projectIdString, yjsStateIdString] = data.documentName.split('/');
    const projectId = ProjectId.create(projectIdString);
    const yjsStateId = YjsStateId.create(yjsStateIdString);

    const state = await this.yjsStateStore.load(projectId, yjsStateId);
    if (state) {
      applyUpdate(data.document, state);
    }
  }

  /** Encodes the current Yjs document state and persists it to the store. */
  async onStoreDocument(data: onStoreDocumentPayload): Promise<void> {
    const [projectIdString, yjsStateIdString] = data.documentName.split('/');
    const projectId = ProjectId.create(projectIdString);
    const yjsStateId = YjsStateId.create(yjsStateIdString);

    const state = Buffer.from(encodeStateAsUpdate(data.document));
    await this.yjsStateStore.save(projectId, yjsStateId, state);
  }
}
