/** Registration request data. */
export interface RegisterDto {
  /** User's email address. */
  email: string;
  /** User's password (must meet policy requirements). */
  password: string;
  /** User's display name. */
  displayName: string;
}

/** Login request data. */
export interface LoginDto {
  /** User's email address. */
  email: string;
  /** User's password. */
  password: string;
}

/** Password change request data. */
export interface ChangePasswordDto {
  /** Current password for verification. */
  currentPassword: string;
  /** New password to set. */
  newPassword: string;
}

/** Password reset request data (token-based). */
export interface ResetPasswordDto {
  /** Reset token from email. */
  token: string;
  /** New password to set. */
  newPassword: string;
}

/** Password reset request data (email-based). */
export interface RequestPasswordResetDto {
  /** Email address to send reset link to. */
  email: string;
}

/** Generic success response. */
export interface AuthSuccessResponseDto {
  /** Success message. */
  message: string;
}

/** Generic error response. */
export interface AuthErrorResponseDto {
  /** Error details. */
  error: {
    /** Error code for programmatic handling. */
    code: string;
    /** Human-readable error message. */
    message: string;
  };
}

/** User profile response. */
export interface UserProfileDto {
  /** User's unique identifier. */
  userId: string;
}

/** System setup status response. */
export interface SetupStatusDto {
  /** Whether at least one user account exists. */
  configured: boolean;
}
