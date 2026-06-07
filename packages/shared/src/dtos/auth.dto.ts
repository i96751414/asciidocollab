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
  /** Unique identifier of the authenticated user. */
  userId: string;
  /** Display name of the authenticated user. */
  displayName: string;
  /** Email address of the authenticated user. */
  email: string;
  /** Whether the user has administrator privileges. */
  isAdmin: boolean;
  /** Whether the user has verified their email address. */
  emailVerified: boolean;
  /** DiceBear avatar style key, or null for the default. */
  avatarKey: string | null;
  /** UI theme preference: "light", "dark", or "system". */
  appTheme: string;
}

/** Update display name request data. */
export interface UpdateDisplayNameDto {
  /** New display name (min 1, max 100 characters). */
  displayName: string;
}

/** Request email change request data. */
export interface RequestEmailChangeDto {
  /** New email address to change to. */
  newEmail: string;
}

/** Password complexity requirements surfaced to the client. */
export interface PasswordPolicyDto {
  /** Minimum number of characters required. */
  minLength: number;
  /** Whether at least one uppercase letter is required. */
  requireUppercase: boolean;
  /** Whether at least one lowercase letter is required. */
  requireLowercase: boolean;
  /** Whether at least one digit is required. */
  requireDigits: boolean;
  /** Whether at least one symbol is required. */
  requireSymbols: boolean;
}

/** System setup status response. */
export interface SetupStatusDto {
  /** Whether at least one user account exists. */
  configured: boolean;
  /** Active password policy, so clients can validate before submitting. */
  passwordPolicy: PasswordPolicyDto;
}
