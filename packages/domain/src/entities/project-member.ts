import { ProjectId } from '../value-objects/ids/project-id';
import { UserId } from '../value-objects/ids/user-id';
import { Role } from '../value-objects/identity/role';

/**
 * Represents the membership of a user in a project.
 *
 * The combination of `projectId` and `userId` forms a natural composite key
 * that uniquely identifies a membership record.
 */
export class ProjectMember {
  /** Creates a new ProjectMember record. */
  constructor(
    /** The project the user belongs to. */
    public readonly projectId: ProjectId,
    /** The user who is a member of the project. */
    public readonly userId: UserId,
    /**
     * The role assigned to the user within the project (e.g. Owner, editor,
     *  viewer).
     */
    public readonly role: Role,
    /**
     * Timestamp when the user joined the project. Defaults to the current
     *  time.
     */
    public readonly joinedAt: Date = new Date(),
  ) {}
}
