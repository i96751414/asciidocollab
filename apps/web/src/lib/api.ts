/**
 * API client service layer for communicating with the Fastify backend.
 * Handles authentication via session cookies and provides typed responses.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let csrfToken: string | null = null;

// Fetches a CSRF token from the server and caches it for the page session.
async function getCsrfToken(): Promise<string> {
  if (!csrfToken) {
    const data = await apiRequest<{ token: string }>('/auth/csrf-token');
    csrfToken = data.token;
  }
  return csrfToken;
}

/**
 * Custom error class for API errors.
 */
export class ApiError extends Error {
  /**
   * Creates a new ApiError.
   *
   * @param status - HTTP status code.
   * @param code - Application-specific error code.
   * @param message - Human-readable error message.
   * @param retryAfter - Seconds until the client may retry (present on 429 responses).
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

/**
 * Generic API request function with error handling.
 *
 * @param endpoint - API endpoint path.
 * @param options - Fetch options.
 * @returns Parsed JSON response.
 * @throws {ApiError} When the request fails.
 */
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
 * Pagination parameters for list endpoints.
 */
export interface PaginationParameters {
  /** Page number (1-based). */
  page?: number;
  /** Number of items per page. */
  limit?: number;
  /** Whether to include archived projects. */
  archived?: boolean;
}

/**
 * Paginated response structure.
 */
export interface PaginatedResponse<T> {
  /** The list of items for the current page. */
  data: T[];
  /** Pagination metadata. */
  pagination: {
    /** Current page number. */
    page: number;
    /** Number of items per page. */
    limit: number;
    /** Total number of matching items. */
    total: number;
    /** Total number of pages. */
    totalPages: number;
  };
}

/**
 * Project data structure.
 */
export interface Project {
  /** Unique project identifier. */
  id: string;
  /** Display name of the project. */
  name: string;
  /** Optional project description. */
  description: string | null;
  /** User ID of the project owner. */
  ownerId: string;
  /** Display name of the project owner. */
  ownerName: string;
  /** Categorization tags. */
  tags: string[];
  /** Root folder identifier. */
  rootFolderId: string | null;
  /** Archive timestamp, null if not archived. */
  archivedAt: string | null;
  /** Number of project members. */
  memberCount?: number;
  /** Current user's role in the project. */
  role?: "viewer" | "editor" | "administrator";
  /** Creation timestamp. */
  createdAt: string;
  /** Last update timestamp. */
  updatedAt: string;
}

/**
 * Project member data structure.
 */
export interface ProjectMember {
  /** Unique user identifier. */
  userId: string;
  /** User email address. */
  email: string;
  /** User display name. */
  displayName: string;
  /** User role in the project. */
  role: "viewer" | "editor" | "administrator";
  /** Timestamp when the user joined. */
  joinedAt: string;
}

/**
 * API client for authentication operations.
 */
export const authApi = {
  async login(email: string, password: string): Promise<{ message: string }> {
    const token = await getCsrfToken();
    return apiRequest('/auth/login', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
      body: JSON.stringify({ email, password }),
    });
  },

  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ message: string }> {
    const token = await getCsrfToken();
    return apiRequest('/auth/register', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
      body: JSON.stringify({ email, password, displayName }),
    });
  },

  async logout(): Promise<{ message: string }> {
    const token = await getCsrfToken();
    const result = await apiRequest<{ message: string }>('/auth/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
      body: JSON.stringify({}),
    });
    csrfToken = null;
    return result;
  },

  async setupStatus(): Promise<{
    configured: boolean;
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireDigits: boolean;
      requireSymbols: boolean;
    };
  }> {
    return apiRequest('/auth/setup-status');
  },

  async me(): Promise<{ userId: string }> {
    return apiRequest('/auth/me');
  },
};

/**
 * API client for project operations.
 */
export const projectsApi = {
  /**
   * List all projects where the user is a member.
   *
   * @param parameters - Optional pagination and filter parameters.
   * @returns Paginated list of projects.
   */
  async list(parameters?: PaginationParameters): Promise<PaginatedResponse<Project>> {
    const searchParameters = new URLSearchParams();
    if (parameters?.page) searchParameters.set("page", parameters.page.toString());
    if (parameters?.limit) searchParameters.set("limit", parameters.limit.toString());
    if (parameters?.archived !== undefined)
      searchParameters.set("archived", parameters.archived.toString());

    const query = searchParameters.toString();
    return apiRequest(`/api/projects${query ? `?${query}` : ""}`);
  },

  /**
   * Get a project by ID.
   *
   * @param id - Unique identifier of the project.
   * @returns Project details.
   */
  async get(id: string): Promise<{ data: Project }> {
    return apiRequest(`/api/projects/${id}`);
  },

  /**
   * Create a new project.
   *
   * @param data - Project creation data with name, description, and tags.
   * @returns Created project.
   */
  async create(data: {
    name: string;
    description?: string;
    tags?: string[];
  }): Promise<{ data: Project }> {
    return apiRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a project.
   *
   * @param id - Unique identifier of the project.
   * @param data - Partial project fields to update.
   * @returns Updated project.
   */
  async update(
    id: string,
    data: { name?: string; description?: string; tags?: string[] },
  ): Promise<{ data: Project }> {
    return apiRequest(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /**
   * Archive a project.
   *
   * @param id - Unique identifier of the project to archive.
   * @returns Archived project.
   */
  async archive(id: string): Promise<{ data: { id: string; archivedAt: string } }> {
    return apiRequest(`/api/projects/${id}/archive`, {
      method: "POST",
    });
  },

  /**
   * Restore an archived project.
   *
   * @param id - Unique identifier of the project to restore.
   * @returns Restored project.
   */
  async restore(id: string): Promise<{ data: { id: string; archivedAt: null } }> {
    return apiRequest(`/api/projects/${id}/restore`, {
      method: "POST",
    });
  },
};

/**
 * API client for project member operations.
 */
export const membersApi = {
  /**
   * List all members of a project.
   *
   * @param projectId - Unique identifier of the project.
   * @returns List of project members.
   */
  async list(projectId: string): Promise<{ data: { members: ProjectMember[] } }> {
    return apiRequest(`/api/projects/${projectId}/members`);
  },

  /**
   * Invite a user to a project.
   *
   * @param projectId - Unique identifier of the project.
   * @param data - Invitation data with email and role.
   * @returns Created member.
   */
  async invite(
    projectId: string,
    data: { email: string; role: "viewer" | "editor" | "administrator" },
  ): Promise<{ data: ProjectMember }> {
    return apiRequest(`/api/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a member's role.
   *
   * @param projectId - Unique identifier of the project.
   * @param userId - Unique identifier of the user.
   * @param role - New role for the member.
   * @returns Updated member.
   */
  async updateRole(
    projectId: string,
    userId: string,
    role: "viewer" | "editor" | "administrator",
  ): Promise<{ data: { userId: string; role: string } }> {
    return apiRequest(`/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  /**
   * Remove a member from a project.
   *
   * @param projectId - Unique identifier of the project.
   * @param userId - Unique identifier of the user to remove.
   * @returns Success message.
   */
  async remove(
    projectId: string,
    userId: string,
  ): Promise<{ data: { message: string } }> {
    return apiRequest(`/api/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
    });
  },
};
