import { FileNode } from '../entities/file-node';
import { Document } from '../entities/document';
import { UserId } from '../value-objects/user-id';
import { ProjectId } from '../value-objects/project-id';
import { FileNodeRepository } from '../repositories/file-node.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { ProjectRepository } from '../repositories/project.repository';
import { PermissionDeniedError } from '../errors/permission-denied';
import { ProjectNotFoundError } from '../errors/project-not-found';
import { DomainError } from '../errors/domain-error';
import { Result } from '@asciidocollab/shared';

/** A single node in the project file tree, with nested children for folders. */
export interface FileTreeNode {
  /**
   *
   */
  id: string;
  /**
   *
   */
  name: string;
  /**
   *
   */
  type: string;
  /**
   *
   */
  path: string;
  /**
   *
   */
  mimeType?: string;
  /**
   *
   */
  children: FileTreeNode[];
}

function buildTree(
  nodes: FileNode[],
  parentId: string | null,
  documents: Map<string, Document>,
): FileTreeNode[] {
  return nodes
    .filter(n => (n.parentId?.value ?? null) === parentId)
    .map(n => ({
      id: n.id.value,
      name: n.name,
      type: n.type.value,
      path: n.path.value,
      mimeType: documents.get(n.id.value)?.mimeType.value,
      children: buildTree(nodes, n.id.value, documents),
    }));
}

/**
 * Retrieves the full file tree of a project, including documents and their MIME types.
 * Requires the actorId to be a member of the project.
 */
export class GetProjectTreeUseCase {
  /**
   *
   */
  constructor(
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly projectRepo: ProjectRepository,
  ) {}

  /**
   * Retrieves the full file tree of a project, including documents and their MIME types.
   *
   * @param actorId - The user requesting the file tree.
   * @param projectId - The project whose file tree to retrieve.
   * @returns The root folder and its nested children.
   * On failure returns `ProjectNotFoundError` if the project does not exist,
   * or `PermissionDeniedError` if `actorId` is not a project member.
   */
  async execute(
    actorId: UserId,
    projectId: ProjectId,
  ): Promise<Result<{ root: FileTreeNode }, DomainError>> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { success: false, error: new ProjectNotFoundError(projectId.value) };
    }

    const member = await this.projectMemberRepo.findByCompositeKey(projectId, actorId);
    if (!member) {
      return { success: false, error: new PermissionDeniedError() };
    }

    const nodes = await this.fileNodeRepo.findByProjectId(projectId);

    const docs = await this.documentRepo.findByFileNodeIds(
      nodes.map((n) => n.id),
    );
    const documents = new Map<string, Document>();
    for (const doc of docs) {
      documents.set(doc.fileNodeId.value, doc);
    }

    const rootNode = nodes.find(n => (n.parentId?.value ?? null) === null);
    const rootChildren = rootNode ? buildTree(nodes, rootNode.id.value, documents) : [];

    const root: FileTreeNode = {
      id: project.rootFolderId!.value,
      name: rootNode ? rootNode.name : project.name.value,
      type: 'folder',
      path: '/',
      children: rootChildren,
    };

    return { success: true, value: { root } };
  }
}
