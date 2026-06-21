import { CollaborationSessionRepository } from '../../../src/ports/project/collaboration-session.repository';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { DocumentId } from '../../../src/value-objects/ids/document-id';

/** In-memory implementation of CollaborationSessionRepository for use in tests. */
export class InMemoryCollaborationSessionRepository implements CollaborationSessionRepository {
  private readonly sessions = new Set<string>();

  private key(projectId: ProjectId, documentId: DocumentId): string {
    return `${projectId.value}:${documentId.value}`;
  }

  async isActive(projectId: ProjectId, documentId: DocumentId): Promise<boolean> {
    return this.sessions.has(this.key(projectId, documentId));
  }

  async open(projectId: ProjectId, documentId: DocumentId): Promise<void> {
    this.sessions.add(this.key(projectId, documentId));
  }

  async close(projectId: ProjectId, documentId: DocumentId): Promise<void> {
    this.sessions.delete(this.key(projectId, documentId));
  }

  async closeAllForProject(projectId: ProjectId): Promise<void> {
    const prefix = `${projectId.value}:`;
    for (const key of this.sessions) {
      if (key.startsWith(prefix)) {
        this.sessions.delete(key);
      }
    }
  }

  async findActiveDocumentIds(projectId: ProjectId): Promise<DocumentId[]> {
    const prefix = `${projectId.value}:`;
    const ids: DocumentId[] = [];
    for (const key of this.sessions) {
      if (key.startsWith(prefix)) {
        ids.push(DocumentId.create(key.slice(prefix.length)));
      }
    }
    return ids;
  }

  async closeAll(): Promise<void> {
    this.sessions.clear();
  }
}
