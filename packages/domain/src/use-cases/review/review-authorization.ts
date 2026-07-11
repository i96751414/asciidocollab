import { UserId } from '../../value-objects/ids/user-id';
import { ProjectId } from '../../value-objects/ids/project-id';
import { ProjectMemberRepository } from '../../ports/project/project-member.repository';
import { AuditLogRepository } from '../../ports/admin/audit-log.repository';
import { Logger } from '../../ports/observability/logger';
import { RequestContext } from '../../types/request-context';
import { PermissionDeniedError } from '../../errors/common/permission-denied';
import { recordAuthorizationDenial } from '../audit-recording';

/** The resource type recorded on review authorization audit entries. */
export const REVIEW_RESOURCE_TYPE = 'ReviewComment';

/** Details needed to check a caller's review authorization and audit a denial. */
export interface ReviewAuthzContext {
  /** The acting user. */
  readonly actorId: UserId;
  /** The project the action targets (tenant scope). */
  readonly projectId: ProjectId;
  /** The id of the resource acted upon (for the audit record). */
  readonly resourceId: string;
  /** Request origin, captured into audit metadata. */
  readonly context?: RequestContext;
}

/** Roles allowed to write review content. */
const EDITOR_ROLES = new Set(['editor', 'owner']);

/**
 * Ensures the caller may write review content (editor or owner). On denial,
 * records an audited `authz.denied` event and returns the error; otherwise null.
 *
 * @returns A {@link PermissionDeniedError} when denied, or null when allowed.
 */
export async function requireProjectEditor(
  projectMemberRepo: ProjectMemberRepository,
  auditLogRepo: AuditLogRepository,
  authz: ReviewAuthzContext,
  logger?: Logger,
): Promise<PermissionDeniedError | null> {
  const membership = await projectMemberRepo.findByCompositeKey(authz.projectId, authz.actorId);
  if (membership && EDITOR_ROLES.has(membership.role.value)) return null;
  await recordAuthorizationDenial(
    auditLogRepo,
    {
      actorId: authz.actorId,
      projectId: authz.projectId,
      resourceType: REVIEW_RESOURCE_TYPE,
      resourceId: authz.resourceId,
      reason: membership ? 'insufficient_role' : 'not_a_project_member',
      context: authz.context,
    },
    logger,
  );
  return new PermissionDeniedError('Permission denied', REVIEW_RESOURCE_TYPE, authz.resourceId, 'not_editor');
}

/**
 * Ensures the caller is the project OWNER (project-wide bulk delete). On denial,
 * records an audited `authz.denied` event and returns the error; otherwise null.
 *
 * @returns A {@link PermissionDeniedError} when denied, or null when allowed.
 */
export async function requireProjectOwner(
  projectMemberRepo: ProjectMemberRepository,
  auditLogRepo: AuditLogRepository,
  authz: ReviewAuthzContext,
  logger?: Logger,
): Promise<PermissionDeniedError | null> {
  const membership = await projectMemberRepo.findByCompositeKey(authz.projectId, authz.actorId);
  if (membership && membership.role.value === 'owner') return null;
  await recordAuthorizationDenial(
    auditLogRepo,
    {
      actorId: authz.actorId,
      projectId: authz.projectId,
      resourceType: REVIEW_RESOURCE_TYPE,
      resourceId: authz.resourceId,
      reason: membership ? 'not_owner' : 'not_a_project_member',
      context: authz.context,
    },
    logger,
  );
  return new PermissionDeniedError('Permission denied', REVIEW_RESOURCE_TYPE, authz.resourceId, 'not_owner');
}

/**
 * Ensures the caller is at least a project member (any role) — used by read
 * paths. No audit on denial (reads are cheap and non-mutating).
 *
 * @returns A {@link PermissionDeniedError} when denied, or null when allowed.
 */
export async function requireProjectMember(
  projectMemberRepo: ProjectMemberRepository,
  projectId: ProjectId,
  actorId: UserId,
): Promise<PermissionDeniedError | null> {
  const membership = await projectMemberRepo.findByCompositeKey(projectId, actorId);
  return membership ? null : new PermissionDeniedError('Permission denied', REVIEW_RESOURCE_TYPE);
}
