/**
 * Admin and account-lifecycle API client (user administration, invitations,
 * email verification, session status, audit logs, and application settings).
 */
import { apiRequest } from '@/lib/api/transport';

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

/** A single audit-log event as returned by the admin API. */
export interface AuditLogItem {
  /** Unique identifier for this log entry. */
  id: string;
  /** ID of the user who triggered the action, or null for system events. */
  userId: string | null;
  /** Display name of the actor at the time of the event. */
  actorDisplayName: string | null;
  /** Project ID associated with this event, if applicable. */
  projectId: string | null;
  /** Machine-readable action type string (e.g. 'FILE_UPLOAD'). */
  action: string;
  /** Type of resource affected (e.g. 'FILE', 'PROJECT', 'PAGE'). */
  resourceType: string;
  /** ID or path identifying the affected resource. */
  resourceId: string;
  /** ISO 8601 UTC timestamp when the event occurred. */
  timestamp: string;
  /** Arbitrary key–value metadata attached to the event. */
  metadata: Record<string, unknown>;
}

/** Filter parameters for the audit-log listing endpoint. */
interface AuditLogFilters {
  /** ISO 8601 start of the time range. */
  fromDate?: string;
  /** ISO 8601 end of the time range. */
  toDate?: string;
  /** Filter by actor user ID. */
  userId?: string;
  /** Filter by action type string. */
  actionType?: string;
  /** 1-based page number. */
  page?: number;
  /** Results per page. */
  limit?: number;
}

/** Paginated audit-log response from the admin API. */
interface AuditLogPage {
  /** The log items on the current page. */
  items: AuditLogItem[];
  /** Total item count across all pages. */
  total: number;
  /** Current page number. */
  page: number;
  /** Results-per-page limit. */
  limit: number;
}

/** Response from the distinct action-types endpoint. */
interface AuditLogActionTypesResponse {
  /** All distinct action-type strings present in the audit log. */
  actionTypes: string[];
}

/** Admin-controlled application settings. */
export interface AdminSettings {
  /** Whether self-registration is currently open to the public. */
  openRegistration: boolean;
  /** Maximum upload size in bytes. */
  maxUploadSizeBytes?: number;
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

  async getAuditLogs(parameters?: AuditLogFilters): Promise<AuditLogPage> {
    const query = new URLSearchParams();
    if (parameters?.fromDate) query.set('fromDate', parameters.fromDate);
    if (parameters?.toDate) query.set('toDate', parameters.toDate);
    if (parameters?.userId) query.set('userId', parameters.userId);
    if (parameters?.actionType) query.set('actionType', parameters.actionType);
    if (parameters?.page) query.set('page', String(parameters.page));
    if (parameters?.limit) query.set('limit', String(parameters.limit));
    const qs = query.toString();
    return apiRequest(`/admin/audit-logs${qs ? `?${qs}` : ''}`);
  },

  async getAuditLogActionTypes(): Promise<AuditLogActionTypesResponse> {
    return apiRequest('/admin/audit-logs/action-types');
  },
};
