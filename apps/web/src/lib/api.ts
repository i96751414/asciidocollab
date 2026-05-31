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
  /**
   *
   */
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
      "Content-Type": "application/json",
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

/**
 *
 */
export interface PaginationParameters {
  /**
   *
   */
  page?: number;
  /**
   *
   */
  limit?: number;
  /**
   *
   */
  archived?: boolean;
}

/**
 *
 */
export interface PaginatedResponse<T> {
  /**
   *
   */
  data: T[];
  /**
   *
   */
  pagination: {
    /**
     *
     */
    page: number;
    /**
     *
     */
    limit: number;
    /**
     *
     */
    total: number;
    /**
     *
     */
    totalPages: number;
  };
}

/**
 *
 */
export type ProjectMemberRole = "viewer" | "editor" | "owner";

/**
 *
 */
export interface Project {
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
  description: string | null;
  /**
   *
   */
  owners: { userId: string; displayName: string }[];
  /**
   *
   */
  tags: string[];
  /**
   *
   */
  rootFolderId: string | null;
  /**
   *
   */
  archivedAt: string | null;
  /**
   *
   */
  memberCount?: number;
  /**
   *
   */
  role?: ProjectMemberRole;
  /**
   *
   */
  createdAt: string;
  /**
   *
   */
  updatedAt: string;
}

/**
 *
 */
export interface ProjectMember {
  /**
   *
   */
  userId: string;
  /**
   *
   */
  email: string;
  /**
   *
   */
  displayName: string;
  /**
   *
   */
  role: ProjectMemberRole;
  /**
   *
   */
  joinedAt: string;
}

/**
 *
 */
export interface UserSearchResult {
  /**
   *
   */
  userId: string;
  /**
   *
   */
  displayName: string;
  /**
   *
   */
  email: string;
}

export const authApi = {
  async login(email: string, password: string): Promise<{ /**
                                                           *
                                                           */
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
  ): Promise<{ /**
                *
                */
  message: string }> {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
  },

  async logout(): Promise<{ /**
                             *
                             */
  message: string }> {
    return apiRequest<{ /**
                         *
                         */
    message: string }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async setupStatus(): Promise<{
    /**
     *
     */
    configured: boolean;
    /**
     *
     */
    passwordPolicy: {
      /**
       *
       */
      minLength: number;
      /**
       *
       */
      requireUppercase: boolean;
      /**
       *
       */
      requireLowercase: boolean;
      /**
       *
       */
      requireDigits: boolean;
      /**
       *
       */
      requireSymbols: boolean;
    };
  }> {
    return apiRequest('/auth/setup-status');
  },

  async me(): Promise<{ /**
                         *
                         */
  userId: string; /**
                   *
                   */
  displayName: string; /**
                        *
                        */
  email: string }> {
    return apiRequest('/auth/me');
  },

  async requestPasswordReset(email: string): Promise<{ /**
                                                        *
                                                        */
  message: string }> {
    return apiRequest('/auth/password/reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ /**
                                                                      *
                                                                      */
  message: string }> {
    return apiRequest('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ /**
                                                                                 *
                                                                                 */
  message: string }> {
    return apiRequest('/auth/password/change', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async updateDisplayName(displayName: string): Promise<{ /**
                                                           *
                                                           */
  message: string }> {
    return apiRequest('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    });
  },

  async requestEmailChange(newEmail: string): Promise<{ /**
                                                         *
                                                         */
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

  async get(id: string): Promise<{ /**
                                    *
                                    */
  data: Project }> {
    return apiRequest(`/api/projects/${id}`);
  },

  async create(data: {
    /**
     *
     */
    name: string;
    /**
     *
     */
    description?: string;
    /**
     *
     */
    tags?: string[];
  }): Promise<{ /**
                 *
                 */
  data: Project }> {
    return apiRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async update(
    id: string,
    data: { /**
             *
             */
    name?: string; /**
                    *
                    */
    description?: string; /**
                           *
                           */
    tags?: string[] },
  ): Promise<{ /**
                *
                */
  data: Project }> {
    return apiRequest(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async archive(id: string): Promise<{ /**
                                        *
                                        */
  data: { /**
           *
           */
  id: string; /**
               *
               */
  archivedAt: string } }> {
    return apiRequest(`/api/projects/${id}/archive`, { method: "POST" });
  },

  async restore(id: string): Promise<{ /**
                                        *
                                        */
  data: { /**
           *
           */
  id: string; /**
               *
               */
  archivedAt: null } }> {
    return apiRequest(`/api/projects/${id}/restore`, { method: "POST" });
  },

  async delete(id: string): Promise<{ /**
                                       *
                                       */
  data: { /**
           *
           */
  id: string } }> {
    return apiRequest(`/api/projects/${id}`, { method: "DELETE" });
  },
};

export const membersApi = {
  async list(projectId: string): Promise<{ /**
                                            *
                                            */
  data: { /**
           *
           */
  members: ProjectMember[] } }> {
    return apiRequest(`/api/projects/${projectId}/members`);
  },

  async invite(
    projectId: string,
    data: { /**
             *
             */
    email: string; /**
                    *
                    */
    role: ProjectMemberRole },
  ): Promise<{ /**
                *
                */
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
  ): Promise<{ /**
                *
                */
  data: { /**
           *
           */
  userId: string; /**
                   *
                   */
  role: string } }> {
    return apiRequest(`/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  async remove(
    projectId: string,
    userId: string,
  ): Promise<{ /**
                *
                */
  data: { /**
           *
           */
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
  ): Promise<{ /**
                *
                */
  data: { /**
           *
           */
  users: UserSearchResult[] } }> {
    const parameters = new URLSearchParams({ q: query });
    if (excludeProjectId) parameters.set('excludeProjectId', excludeProjectId);
    return apiRequest(`/api/users/search?${parameters.toString()}`);
  },
};
