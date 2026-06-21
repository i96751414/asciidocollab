import { PrismaClient } from '@prisma/client';
import { CollaborationSessionRepository } from '@asciidocollab/domain';
import { ProjectId } from '@asciidocollab/domain';
import { DocumentId } from '@asciidocollab/domain';

/** Prisma-backed implementation of CollaborationSessionRepository. */
export class PrismaCollaborationSessionRepository implements CollaborationSessionRepository {
  /** Creates a repository backed by the given Prisma client. */
  constructor(private readonly prisma: PrismaClient) {}

  /** Returns true if a row exists for the given project and document. */
  async isActive(projectId: ProjectId, documentId: DocumentId): Promise<boolean> {
    const record = await this.prisma.collaborationSession.findFirst({
      where: { projectId: projectId.value, documentId: documentId.value },
    });
    return record !== null;
  }

  /** Upserts a session row to mark a room as open. */
  async open(projectId: ProjectId, documentId: DocumentId): Promise<void> {
    await this.prisma.collaborationSession.upsert({
      where: { projectId_documentId: { projectId: projectId.value, documentId: documentId.value } },
      create: { projectId: projectId.value, documentId: documentId.value },
      update: {},
    });
  }

  /** Deletes the session row for the given project and document. */
  async close(projectId: ProjectId, documentId: DocumentId): Promise<void> {
    await this.prisma.collaborationSession.deleteMany({
      where: { projectId: projectId.value, documentId: documentId.value },
    });
  }

  /** Deletes all session rows for the given project. */
  async closeAllForProject(projectId: ProjectId): Promise<void> {
    await this.prisma.collaborationSession.deleteMany({
      where: { projectId: projectId.value },
    });
  }

  /** Returns all document IDs with an active session for the given project. */
  async findActiveDocumentIds(projectId: ProjectId): Promise<DocumentId[]> {
    const rows = await this.prisma.collaborationSession.findMany({
      where: { projectId: projectId.value },
      select: { documentId: true },
    });
    return rows.map((row) => DocumentId.create(row.documentId));
  }

  /** Deletes all session rows in the table. */
  async closeAll(): Promise<void> {
    await this.prisma.collaborationSession.deleteMany();
  }
}
