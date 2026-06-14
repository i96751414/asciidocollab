/**
 * Barrel for the API client service layer. The implementation is split into
 * cohesive modules under `@/lib/api/*` (transport + one module per domain);
 * this file re-exports the public surface so existing `@/lib/api` imports keep
 * working unchanged.
 *
 * CSRF protection is handled by SameSite=Strict cookies + server-side Origin
 * header validation. No manual CSRF tokens are needed.
 */
export { ApiError } from '@/lib/api/transport';
export type { PaginationParameters, PaginatedResponse } from '@/lib/api/transport';

export { authApi } from '@/lib/api/auth';

export { projectsApi } from '@/lib/api/projects';
export type { Project, ProjectMemberRole } from '@/lib/api/projects';

export { membersApi } from '@/lib/api/members';
export type { ProjectMember } from '@/lib/api/members';

export { usersApi } from '@/lib/api/users';
export type { UserSearchResult } from '@/lib/api/users';

export { adminApi } from '@/lib/api/admin';
export type { AdminUser, SessionStatus, AuditLogItem, AdminSettings } from '@/lib/api/admin';
