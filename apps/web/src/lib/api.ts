/**
 * API client service layer for communicating with the Fastify backend.
 * CSRF protection is handled by SameSite=Strict cookies + server-side Origin header
 * validation. No manual CSRF tokens are needed.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Custom error class for API errors.
 */
export class ApiError extends Error {
  /** Constructs an ApiError with HTTP status, error code, human-readable message, and optional retry delay. */
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: {
      // Only declare Content-Type when there is a body to describe.
      // Sending Content-Type: application/json on a bodyless POST causes
      // Fastify's JSON body parser to attempt to parse an empty body → 400.
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error?.code ?? "UNKNOWN_ERROR",
      data.error?.message ?? "An unexpected error occurred",
      data.error?.retryAfter,
    );
  }

  return data;
}

/** Query parameters for paginated list endpoints. */
export interface PaginationParameters {
  /** The 1-based page number to retrieve. */
  page?: number;
  /** Maximum number of items to return per page. */
  limit?: number;
  /** When true, include only archived items; when false, only active items. */
  archived?: boolean;
}

/** Generic wrapper returned by paginated list endpoints. */
export interface PaginatedResponse<T> {
  /** The array of items on the current page. */
  data: T[];
  /** Pagination metadata describing the current page position and total counts. */
  pagination: {
    /** The current page number. */
    page: number;
    /** The maximum number of items returned per page. */
    limit: number;
    /** Total number of items across all pages. */
    total: number;
    /** Total number of pages available. */
    totalPages: number;
  };
}

/** Role a user can hold within a project. */
export type ProjectMemberRole = "viewer" | "editor" | "owner";

/** Represents a project resource returned by the API. */
export interface Project {
  /** Unique identifier for the project. */
  id: string;
  /** Human-readable name of the project. */
  name: string;
  /** Optional description of the project's purpose. */
  description: string | null;
  /** List of users who own this project, each identified by userId and displayName. */
  owners: { userId: string; displayName: string }[];
  /** Taxonomy tags associated with the project. */
  tags: string[];
  /** Identifier of the project's root folder, or null if none has been created. */
  rootFolderId: string | null;
  /** ISO timestamp when the project was archived, or null if it is active. */
  archivedAt: string | null;
  /** Total number of members in the project, included in list responses. */
  memberCount?: number;
  /** The calling user's role in this project, included when fetching as an authenticated member. */
  role?: ProjectMemberRole;
  /** ISO timestamp when the project was created. */
  createdAt: string;
  /** ISO timestamp when the project was last updated. */
  updatedAt: string;
}

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

/** Represents a user returned from the user search endpoint. */
export interface UserSearchResult {
  /** Unique identifier of the user. */
  userId: string;
  /** Display name of the user. */
  displayName: string;
  /** Email address of the user. */
  email: string;
}

export const authApi = {
  async login(email: string, password: string): Promise<{ /** Confirmation message from the server. */
  message: string }> {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ /** Confirmation message from the server. */ message: string; /** True when email verification is required before login. */ requiresEmailVerification?: boolean }> {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
  },

  async logout(): Promise<{ /** Confirmation message from the server. */
  message: string }> {
    return apiRequest<{ /** Confirmation message from the server. */
    message: string }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async setupStatus(): Promise<{
    /** Whether the application has been configured with an admin account. */
    configured: boolean;
    /** Password policy rules enforced by the server. */
    passwordPolicy: {
      /** Minimum required password length. */
      minLength: number;
      /** Whether the password must contain at least one uppercase letter. */
      requireUppercase: boolean;
      /** Whether the password must contain at least one lowercase letter. */
      requireLowercase: boolean;
      /** Whether the password must contain at least one digit. */
      requireDigits: boolean;
      /** Whether the password must contain at least one symbol character. */
      requireSymbols: boolean;
    };
  }> {
    return apiRequest('/auth/setup-status');
  },

  async me(): Promise<{ /** Unique identifier of the authenticated user. */
  userId: string; /** Display name of the authenticated user. */
  displayName: string; /** Email address of the authenticated user. */
  email: string }> {
    return apiRequest('/auth/me');
  },

  async requestPasswordReset(email: string): Promise<{ /** Confirmation message from the server. */
  message: string }> {
    return apiRequest('/auth/password/reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ /** Confirmation message from the server. */
  message: string }> {
    return apiRequest('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ /** Confirmation message from the server. */
  message: string }> {
    return apiRequest('/auth/password/change', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async updateDisplayName(displayName: string): Promise<{ /** Confirmation message from the server. */
  message: string }> {
    return apiRequest('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    });
  },

  async requestEmailChange(newEmail: string): Promise<{ /** Confirmation message from the server. */
  message: string }> {
    return apiRequest('/auth/email/change-request', {
      method: 'POST',
      body: JSON.stringify({ newEmail }),
    });
  },
};

export const projectsApi = {
  async list(parameters?: PaginationParameters): Promise<PaginatedResponse<Project>> {
    const searchParameters = new URLSearchParams();
    if (parameters?.page) searchParameters.set("page", parameters.page.toString());
    if (parameters?.limit) searchParameters.set("limit", parameters.limit.toString());
    if (parameters?.archived !== undefined)
      searchParameters.set("archived", parameters.archived.toString());

    const query = searchParameters.toString();
    return apiRequest(`/api/projects${query ? `?${query}` : ""}`);
  },

  async get(id: string): Promise<{ /** The retrieved project. */
  data: Project }> {
    return apiRequest(`/api/projects/${id}`);
  },

  async create(data: {
    /** Name for the new project. */
    name: string;
    /** Optional description for the new project. */
    description?: string;
    /** Optional taxonomy tags for the new project. */
    tags?: string[];
  }): Promise<{ /** The newly created project. */
  data: Project }> {
    return apiRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async update(
    id: string,
    data: { /** Updated project name. */
    name?: string; /** Updated project description. */
    description?: string; /** Updated taxonomy tags. */
    tags?: string[] },
  ): Promise<{ /** The updated project. */
  data: Project }> {
    return apiRequest(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async archive(id: string): Promise<{ /** Confirmation payload containing the archived project id and timestamp. */
  data: { /** Unique identifier of the archived project. */
  id: string; /** ISO timestamp when the project was archived. */
  archivedAt: string } }> {
    return apiRequest(`/api/projects/${id}/archive`, { method: "POST" });
  },

  async restore(id: string): Promise<{ /** Confirmation payload containing the restored project id and cleared timestamp. */
  data: { /** Unique identifier of the restored project. */
  id: string; /** Always null after a successful restore. */
  archivedAt: null } }> {
    return apiRequest(`/api/projects/${id}/restore`, { method: "POST" });
  },

  async delete(id: string): Promise<{ /** Confirmation payload containing the deleted project id. */
  data: { /** Unique identifier of the deleted project. */
  id: string } }> {
    return apiRequest(`/api/projects/${id}`, { method: "DELETE" });
  },
};

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
      method: "POST",
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
      method: "PATCH",
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
      method: "DELETE",
    });
  },
};

export const usersApi = {
  async search(
    query: string,
    excludeProjectId?: string,
  ): Promise<{ /** Wrapper object containing the search results. */
  data: { /** List of users matching the query. */
  users: UserSearchResult[] } }> {
    const parameters = new URLSearchParams({ q: query });
    if (excludeProjectId) parameters.set('excludeProjectId', excludeProjectId);
    return apiRequest(`/api/users/search?${parameters.toString()}`);
  },
};

/** Admin view of a user account. */
export interface AdminUser {
  /** Unique identifier of the user. */
  id: string;
  /** Email address of the user. */
  email: string;
  /** Display name chosen by the user. */
  displayName: string;
  /** Whether the user has administrator privileges. */
  isAdmin: boolean;
  /** Whether the user has verified their email address. */
  emailVerified: boolean;
  /** How the user was registered. */
  registrationMethod: 'SELF_REGISTERED' | 'INVITED';
  /** ISO timestamp when the account was created. */
  createdAt: string;
}

/** Session authentication and verification state returned by /auth/session-status. */
export interface SessionStatus {
  /** Whether the request carries a valid authenticated session. */
  authenticated: boolean;
  /** Whether the authenticated user has verified their email address. */
  emailVerified: boolean;
  /** Whether the authenticated user has administrator privileges. */
  isAdmin: boolean;
}

/** Admin-controlled application settings. */
export interface AdminSettings {
  /** Whether self-registration is currently open to the public. */
  openRegistration: boolean;
}

export const adminApi = {
  async inviteUser(email: string): Promise<void> {
    return apiRequest('/admin/users/invite', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async getAcceptInvitePreview(token: string): Promise<{ /** Email address associated with the invitation. */
  email: string }> {
    return apiRequest(`/auth/accept-invite?token=${encodeURIComponent(token)}`);
  },

  async acceptInvite(token: string, displayName: string, password: string): Promise<void> {
    return apiRequest('/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token, displayName, password }),
    });
  },

  async getAdminUsers(): Promise<{ /** List of all registered users. */
  users: AdminUser[] }> {
    return apiRequest('/admin/users');
  },

  async setAdminStatus(userId: string, isAdmin: boolean): Promise<void> {
    return apiRequest(`/admin/users/${userId}/admin`, {
      method: 'PATCH',
      body: JSON.stringify({ isAdmin }),
    });
  },

  async getUserRemovalPreview(userId: string): Promise<{ /** Projects that will be transferred to the acting admin. */
  projectsToTransfer: Array<{ /** Unique identifier of the project. */
  id: string; /** Name of the project. */
  name: string }> }> {
    return apiRequest(`/admin/users/${userId}/removal-preview`);
  },

  async removeUser(userId: string): Promise<void> {
    return apiRequest(`/admin/users/${userId}`, { method: 'DELETE' });
  },

  async getAdminSettings(): Promise<AdminSettings> {
    return apiRequest('/admin/settings');
  },

  async updateAdminSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> {
    return apiRequest('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },

  async getOpenRegistrationStatus(): Promise<{ /** Whether self-registration is currently enabled. */
  openRegistration: boolean }> {
    return apiRequest('/auth/open-registration-status');
  },

  async resendVerification(): Promise<void> {
    return apiRequest('/auth/resend-verification', { method: 'POST' });
  },

  async verifyEmail(token: string): Promise<void> {
    return apiRequest(`/auth/verify-email?token=${encodeURIComponent(token)}`);
  },

  /** Returns the current session's authentication and verification state. */
  async getSessionStatus(): Promise<SessionStatus> {
    return apiRequest('/auth/session-status');
  },
};
