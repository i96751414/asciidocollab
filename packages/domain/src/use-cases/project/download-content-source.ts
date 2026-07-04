import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNode } from '../../entities/file-node';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { CollaborationSessionRepository } from '../../ports/project/collaboration-session.repository';
import { CollaborativeContentReader } from '../../ports/storage/collaborative-content-reader';
import { Logger } from '../../ports/observability/logger';

/** Per-file content source resolved before serving a download. */
export type DownloadContentSource =
  | { kind: 'inline'; bytes: Buffer }
  | { kind: 'stored' };

/** Dependencies required by {@link resolveDownloadContentSource}. */
export interface ResolveDownloadContentSourceDeps {
  /** Repository used to find the document associated with a file node. */
  documentRepo: Pick<DocumentRepository, 'findByFileNodeId'>;
  /** Repository used to check whether a collaboration session is active. */
  collaborationSessionRepo: Pick<CollaborationSessionRepository, 'isActive'>;
  /** Reader for live Yjs document content from the collab server. */
  collaborativeContentReader: CollaborativeContentReader;
  /** Optional logger for fallback warnings (metadata-only). */
  logger?: Logger;
}

/**
 * Builds a `ResolveDownloadContentSourceDeps` object from optional collaborator deps.
 * Returns `null` if any required dep is absent, preventing silent partial-wiring.
 */
export function buildResolverDeps(
  documentRepo: Pick<DocumentRepository, 'findByFileNodeId'> | undefined,
  collaborationSessionRepo: Pick<CollaborationSessionRepository, 'isActive'> | undefined,
  collaborativeContentReader: CollaborativeContentReader | undefined,
  logger?: Logger,
): ResolveDownloadContentSourceDeps | null {
  if (!documentRepo || !collaborationSessionRepo || !collaborativeContentReader) return null;
  return { documentRepo, collaborationSessionRepo, collaborativeContentReader, logger };
}

/**
 * Resolves the content source for a single file in the download path.
 *
 * Resolution rule (per data-model.md):
 * 1. Find the document for the file node (binary assets have none → stored).
 * 2. Check if a collab session is active (dormant → stored, no collab round-trip).
 * 3. Read live Yjs text; success + non-null → inline bytes (verbatim UTF-8).
 * 4. Null (no live source) → stored silently. Error → warn (metadata only) + stored.
 *
 * The inline branch wraps the reader's value verbatim with `Buffer.from(value, 'utf8')` — no
 * re-assembly — so the returned bytes are a consistent, non-torn snapshot.
 * This function never reads the file store; the route streams the stored case.
 */
export async function resolveDownloadContentSource(
  deps: ResolveDownloadContentSourceDeps,
  projectId: ProjectId,
  fileNode: FileNode,
): Promise<DownloadContentSource> {
  try {
    const document = await deps.documentRepo.findByFileNodeId(fileNode.id);
    if (!document) return { kind: 'stored' };

    const sessionActive = await deps.collaborationSessionRepo.isActive(projectId, document.id);
    if (!sessionActive) return { kind: 'stored' };

    const live = await deps.collaborativeContentReader.readContent(projectId, document.yjsStateId);
    if (live.success && live.value !== null) {
      return { kind: 'inline', bytes: Buffer.from(live.value, 'utf8') };
    }

    if (!live.success) {
      deps.logger?.warn('Live collaborative read failed during download; falling back to file store', {
        projectId: projectId.value,
        fileNodeId: fileNode.id.value,
        path: fileNode.path.value,
        error: live.error.message,
      });
    }

    return { kind: 'stored' };
  } catch (error) {
    deps.logger?.warn('Unexpected error resolving download content source; falling back to file store', {
      projectId: projectId.value,
      fileNodeId: fileNode.id.value,
      path: fileNode.path.value,
      error: error instanceof Error ? error.message : String(error),
    });
    return { kind: 'stored' };
  }
}
