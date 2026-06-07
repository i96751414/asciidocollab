import { createRequire } from 'node:module';
import { YjsStateStore, ProjectId, YjsStateId } from '@asciidocollab/domain';

// yjs has "type":"module" but ships ./dist/yjs.cjs via the "require" export condition.
// TypeScript raises TS1479/TS1542 when referencing its ESM type declarations from a CJS
// file, so we declare only the two functions we need locally and load the CJS build.
interface YjsDocument { readonly _isYDoc: unique symbol }
interface Yjs {
  applyUpdate(document: YjsDocument, update: Uint8Array): void;
  encodeStateAsUpdate(document: YjsDocument): Uint8Array;
}
const Y: Yjs = createRequire(__filename)('yjs');

interface DocumentPayload {
  documentName: string;
  document: YjsDocument;
}

/**
 * Hocuspocus persistence extension that loads and stores Yjs document state
 * via the domain YjsStateStore port.
 * DocumentName format: "<projectId>/<yjsStateId>".
 */
export class HocuspocusPersistenceExtension {
  /** @param yjsStateStore - The Yjs state store port. */
  constructor(private readonly yjsStateStore: YjsStateStore) {}

  private parse(documentName: string): { projectId: ProjectId; yjsStateId: YjsStateId } {
    const slash = documentName.indexOf('/');
    return {
      projectId: ProjectId.create(documentName.slice(0, slash)),
      yjsStateId: YjsStateId.create(documentName.slice(slash + 1)),
    };
  }

  /** Loads the Yjs document state from the store and applies it. */
  async onLoadDocument({ documentName, document }: DocumentPayload): Promise<void> {
    const { projectId, yjsStateId } = this.parse(documentName);
    const state = await this.yjsStateStore.load(projectId, yjsStateId);
    if (state) {
      Y.applyUpdate(document, state);
    }
  }

  /** Encodes and persists the current Yjs document state. */
  async onStoreDocument({ documentName, document }: DocumentPayload): Promise<void> {
    const { projectId, yjsStateId } = this.parse(documentName);
    const state = Buffer.from(Y.encodeStateAsUpdate(document));
    await this.yjsStateStore.save(projectId, yjsStateId, state);
  }
}
