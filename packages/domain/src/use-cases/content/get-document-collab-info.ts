import { UserId } from '../../value-objects/user-id';
import { ProjectId } from '../../value-objects/project-id';
import { FileNodeId } from '../../value-objects/file-node-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { DocumentRepository } from '../../ports/file-tree/document.repository';
import { ContentNotFoundError } from '../../errors/content-not-found';
import { requireMemberAndFileNode } from './content-helpers';
import { DomainError } from '../../errors/domain-error';
import { toCollabRole } from './collab-role';
import type { CollabRole } from './collab-role';
import { Result } from '../../types/result';

export type { CollabRole } from './collab-role';

/** Room identifier + role returned to the web editor for a collaborative document. */
export interface DocumentCollabInfo {
  /** Yjs state id; combined with projectId forms the room name `${projectId}/${yjsStateId}`. */
  yjsStateId: string;
  /** Collaboration role of the requesting user for this document. */
  role: CollabRole;
}

/**
 * Resolves the collaboration room id and the requesting user's role for a file,
 * applying the same membership + document-ownership checks as the internal
 * collab-auth route. Files with no backing Document (binary assets) yield a
 * ContentNotFoundError so the client falls back to the legacy REST path.
 */
export class GetDocumentCollabInfoUseCase {
  /** Initializes the use case with the repositories needed to resolve room id and role. */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
  ) {}

  /** Validates membership and document ownership, then returns the room id and mapped role. */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
    fileNodeId: FileNodeId,
  ): Promise<Result<DocumentCollabInfo, DomainError>> {
    const access = await requireMemberAndFileNode(
      this.projectMemberRepo,
      this.fileNodeRepo,
      projectId,
      actorId,
      fileNodeId,
    );
    if (!access.success) return access;

    const document = await this.documentRepo.findByFileNodeId(fileNodeId);
    if (!document) {
      return { success: false, error: new ContentNotFoundError(fileNodeId.value) };
    }

    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    const role: CollabRole = toCollabRole(member?.role.value ?? 'editor');

    return { success: true, value: { yjsStateId: document.yjsStateId.value, role } };
  }
}
