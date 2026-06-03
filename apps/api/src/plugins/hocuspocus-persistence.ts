import { YjsStateStore, ProjectId, YjsStateId } from '@asciidocollab/domain';

// yjs has "type":"module" but ships ./dist/yjs.cjs via the "require" export condition.
// TypeScript raises TS1479/TS1542 when referencing its ESM type declarations from a CJS
// file, so we declare only the two functions we need locally and require the CJS build.
interface YjsDoc { readonly _isYDoc: unique symbol }
interface Yjs {
  applyUpdate(doc: YjsDoc, update: Uint8Array): void;
  encodeStateAsUpdate(doc: YjsDoc): Uint8Array;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Y = require('yjs') as Yjs;

interface DocumentPayload {
  documentName: string;
  document: YjsDoc;
}

/**
 * Hocuspocus persistence extension that loads and stores Yjs document state
 * via the domain YjsStateStore port.
 * documentName format: "<projectId>/<yjsStateId>"
 */
export class HocuspocusPersistenceExtension {
  constructor(private readonly yjsStateStore: YjsStateStore) {}

  private parse(documentName: string): { projectId: ProjectId; yjsStateId: YjsStateId } {
    const slash = documentName.indexOf('/');
    return {
      projectId: ProjectId.create(documentName.slice(0, slash)),
      yjsStateId: YjsStateId.create(documentName.slice(slash + 1)),
    };
  }

  async onLoadDocument({ documentName, document }: DocumentPayload): Promise<void> {
    const { projectId, yjsStateId } = this.parse(documentName);
    const state = await this.yjsStateStore.load(projectId, yjsStateId);
    if (state) {
      Y.applyUpdate(document, state);
    }
  }

  async onStoreDocument({ documentName, document }: DocumentPayload): Promise<void> {
    const { projectId, yjsStateId } = this.parse(documentName);
    const state = Buffer.from(Y.encodeStateAsUpdate(document));
    await this.yjsStateStore.save(projectId, yjsStateId, state);
  }
}
