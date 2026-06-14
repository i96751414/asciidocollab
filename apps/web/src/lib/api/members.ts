/**
 * Project membership API client (invite / list / update-role / remove).
 */
import { apiRequest } from '@/lib/api/transport';
import type { ProjectMemberRole } from '@/lib/api/projects';

/** Represents a user's membership record within a project. */
export interface ProjectMember {
  /** Unique identifier of the member user. */
  userId: string;
  /** Email address of the member. */
  email: string;
  /** Display name of the member. */
  displayName: string;
  /** The member's role within the project. */
  role: ProjectMemberRole;
  /** ISO timestamp when the user joined the project. */
  joinedAt: string;
}

export const membersApi = {
  async list(projectId: string): Promise<{ /** Wrapper object containing the members array. */
  data: { /** List of all members belonging to the project. */
  members: ProjectMember[] } }> {
    return apiRequest(`/api/projects/${projectId}/members`);
  },

  async invite(
    projectId: string,
    data: { /** Email address of the user to invite. */
    email: string; /** Role to assign to the invited user. */
    role: ProjectMemberRole },
  ): Promise<{ /** The newly created membership record. */
  data: ProjectMember }> {
    return apiRequest(`/api/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateRole(
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
  ): Promise<{ /** Confirmation payload with the updated member's id and role. */
  data: { /** Unique identifier of the updated member. */
  userId: string; /** The member's new role. */
  role: string } }> {
    return apiRequest(`/api/projects/${projectId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  async remove(
    projectId: string,
    userId: string,
  ): Promise<{ /** Confirmation payload with a human-readable removal message. */
  data: { /** Confirmation message from the server. */
  message: string } }> {
    return apiRequest(`/api/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    });
  },
};
