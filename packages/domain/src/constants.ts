/** Delay in milliseconds applied to failed login attempts to prevent timing attacks. */
export const LOGIN_DELAY_MS = 500;

/** Delay in milliseconds applied to password reset requests to prevent email enumeration. */
export const PASSWORD_RESET_DELAY_MS = 500;

/** Invitation token TTL: 72 hours. */
export const INVITATION_TOKEN_EXPIRY_MS = 72 * 60 * 60 * 1000;

/** Email verification token TTL: 24 hours. */
export const EMAIL_VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
