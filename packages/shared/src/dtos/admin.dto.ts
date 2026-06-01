/** Admin view of a user account returned by the list-users endpoint. */
export interface AdminUserDto {
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

/** Admin settings response. */
export interface AdminSettingsDto {
  /** Whether self-registration is currently open to the public. */
  openRegistration: boolean;
}

/** Request body for inviting a new user by email. */
export interface AdminInviteUserDto {
  /** Email address of the person to invite. */
  email: string;
}

/** Request body for accepting a registration invitation. */
export interface AcceptInviteDto {
  /** Invitation token from the email link. */
  token: string;
  /** Display name chosen by the registering user. */
  displayName: string;
  /** Password chosen by the registering user. */
  password: string;
}

/** Preview of the side-effects that will occur when removing a user. */
export interface UserRemovalPreviewDto {
  /** Projects that will be transferred to the acting admin because the target user is their sole owner. */
  projectsToTransfer: Array<{ /** Unique identifier of the project. */ id: string; /** Name of the project. */ name: string }>;
}
