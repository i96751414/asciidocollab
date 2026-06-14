import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNode } from '../../entities/file-node';
import { Document } from '../../entities/document';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { ProjectFileStore } from '../../ports/storage/project-file-store';
import { CollaborativeContentReader } from '../../ports/storage/collaborative-content-reader';
import { Logger } from '../../ports/observability/logger';

/** A document file's resolved content plus the collaborative document it came from (if any). */
export interface ResolvedFileContent {
  /** The file's current text — live Yjs content for an open file, else the file store projection. */
  content: string;
  /** The collaborative document for this file when it has a live room, else null. */
  document: Document | null;
}

/** Dependencies for resolving a file's current content, with optional live-read support. */
export interface LiveContentDeps {
  /** Reads the persisted (projection) content. Always required. */
  fileStore: ProjectFileStore;
  /** Optional: resolves a file's collaborative document. Needed to detect open files. */
  documentRepo?: Pick<DocumentRepository, 'findByFileNodeId'>;
  /** Optional: reads the live Yjs content for an open file (the editor's source of truth). */
  collaborativeContentReader?: CollaborativeContentReader;
  /** Optional logger for live-read fallbacks. */
  logger?: Logger;
}

/**
 * Assemble a {@link LiveContentDeps} from a use case's (optional) collaborator references, omitting
 * absent ones so the spread-in-place stays exactOptionalPropertyTypes-clean. Build it ONCE and
 * reuse it across a scan loop rather than rebuilding per file. Shared by find-usages and the symbol
 * rename so both wire live reads identically.
 *
 * @param parts - The file store plus any optional live-read collaborators.
 * @returns The assembled dependencies for {@link resolveFileContent}.
 */
export function liveContentDeps(parts: {
  fileStore: ProjectFileStore;
  documentRepo?: Pick<DocumentRepository, 'findByFileNodeId'>;
  collaborativeContentReader?: CollaborativeContentReader;
  logger?: Logger;
}): LiveContentDeps {
  return {
    fileStore: parts.fileStore,
    ...(parts.documentRepo && { documentRepo: parts.documentRepo }),
    ...(parts.collaborativeContentReader && { collaborativeContentReader: parts.collaborativeContentReader }),
    ...(parts.logger && { logger: parts.logger }),
  };
}

/**
 * Reads a document file's CURRENT content for a server-side scan (find-usages, symbol-rename).
 *
 * For a file that is open in a live collaborative room (has a {@link Document}) with a reader
 * available, this returns the LIVE Yjs text — exactly what the editor shows — so a symbol the user
 * just typed but has not yet saved is visible to the scan. Otherwise (no reader, or a file never
 * opened collaboratively) it returns the file store projection. A live read that errors falls back
 * to the file store with a warning rather than dropping the file from the scan.
 *
 * @param deps - The file store and optional live-read dependencies.
 * @param projectId - The project that owns the file.
 * @param node - The document file node to read.
 * @returns The resolved content and its document, or null when no content exists.
 */
export async function resolveFileContent(
  deps: LiveContentDeps,
  projectId: ProjectId,
  node: FileNode,
): Promise<ResolvedFileContent | null> {
  const document = deps.documentRepo ? await deps.documentRepo.findByFileNodeId(node.id) : null;

  if (document && deps.collaborativeContentReader) {
    const live = await deps.collaborativeContentReader.readContent(projectId, document.yjsStateId);
    // A non-null value is the live source of truth. A null value means the document has no live
    // source (a dormant room never opened/edited) — fall through to the file store silently. Only a
    // genuine read error (collab unreachable) is worth a warning.
    if (live.success && live.value !== null) return { content: live.value, document };
    if (!live.success) {
      deps.logger?.warn('Live content read failed; falling back to file store', {
        path: node.path.value,
        error: live.error.message,
      });
    }
  }

  const buffer = await deps.fileStore.read(projectId, node.path);
  if (!buffer) return null;
  return { content: buffer.toString('utf8'), document };
}
