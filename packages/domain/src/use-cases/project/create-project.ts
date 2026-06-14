import { Project } from '../../entities/project';
import { ProjectMember } from '../../entities/project-member';
import { FileNode } from '../../entities/file-node';
import { AuditLog } from '../../entities/audit-log';
import { UserId } from '../../value-objects/ids/user-id';
import { ProjectName } from '../../value-objects/project/project-name';
import { ProjectId } from '../../value-objects/ids/project-id';
import { FileNodeId } from '../../value-objects/ids/file-node-id';
import { FileNodeType } from '../../value-objects/files/file-node-type';
import { FilePath } from '../../value-objects/files/file-path';
import { Role } from '../../value-objects/identity/role';
import { AuditLogId } from '../../value-objects/ids/audit-log-id';
import { ProjectRepository } from '../../ports/project/project.repository';
import { FileNodeRepository } from '../../ports/file-tree/file-node.repository';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { DomainError } from '../../errors/domain-error';
import { Result } from '../../types/result';
import { randomUUID } from 'crypto';

/** Result returned on successful project creation. */
export interface CreateProjectResult {
  /** The identifier of the newly created project. */
  projectId: ProjectId;
  /** The identifier of the automatically created root folder. */
  rootFolderId: FileNodeId;
  /** The role assigned to the creator (always `'owner'`). */
  ownerRole: string;
}

/**
 * Creates a new project with a root folder, adds the creator as an administrator,
 * and records an audit log entry.
 * Requires the actorId to exist as a registered user.
 */
export class CreateProjectUseCase {
  /** Creates a new CreateProjectUseCase instance. */
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly fileNodeRepo: FileNodeRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   * Creates a new project with a root folder, adds the creator as an administrator,
   * and records an audit log entry.
   *
   * @param actorId - The user who is creating the project.
   * @param name - The validated project name.
   * @param description - An optional project description.
   * @param initialTags - Tags to associate with the project on creation.
   * @returns The newly created project ID, root folder ID, owner ID, and owner role.
   * Never returns an error under current logic (always succeeds if dependencies are available).
   */
  async execute(
    actorId: UserId,
    name: ProjectName,
    description: string | null,
    initialTags: string[],
  ): Promise<Result<CreateProjectResult, DomainError>> {
    const projectId = ProjectId.create(randomUUID());
    const rootFolderId = FileNodeId.create(randomUUID());

    const project = new Project(
      projectId,
      name,
      description,
      initialTags,
      null,
    );

    await this.projectRepo.save(project);

    const rootFolder = new FileNode(
      rootFolderId,
      projectId,
      null,
      name.value,
      FileNodeType.create('folder'),
      FilePath.create('/'),
    );

    await this.fileNodeRepo.save(rootFolder);

    project.setRootFolderId(rootFolderId);
    await this.projectRepo.save(project);

    const member = new ProjectMember(
      projectId,
      actorId,
      Role.create('owner'),
      new Date(),
    );

    await this.projectMemberRepo.addMember(member);

    const auditLog = new AuditLog(
      AuditLogId.create(randomUUID()),
      actorId,
      projectId,
      'project.created',
      'Project',
      projectId.value,
    );

    await this.auditLogRepo.save(auditLog);

    return {
      success: true,
      value: {
        projectId,
        rootFolderId,
        ownerRole: Role.create('owner').value,
      },
    };
  }
}
