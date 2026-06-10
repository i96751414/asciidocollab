/** Formats a byte count as a compact human-readable string (B / KB / MB / GB). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Converts a raw audit-log action type string into a human-readable label.
 * Uses metadata where available to add context, for example the enabled/disabled state.
 * Unknown action types are returned as-is so no information is lost.
 */
export function formatAuditAction(action: string, metadata: Record<string, unknown> = {}): string {
  switch (action) {
    case 'UNAUTHORIZED_PAGE_ACCESS': {
      return 'Unauthorized Access Attempt';
    }

    case 'auth.email_verified': {
      return 'Email Verified';
    }

    case 'file.deleted': {
      return 'File Deleted';
    }

    case 'file.renamed': {
      return 'File Renamed';
    }

    case 'member.invited': {
      return 'Member Invited';
    }

    case 'member.removed': {
      return 'Member Removed';
    }

    case 'member.roleChanged': {
      return 'Member Role Changed';
    }

    case 'project.archived': {
      return 'Project Archived';
    }

    case 'project.created': {
      return 'Project Created';
    }

    case 'project.deleted': {
      return 'Project Deleted';
    }

    case 'project.restored': {
      return 'Project Restored';
    }

    case 'project.updated': {
      return 'Project Updated';
    }

    case 'settings.max_upload_size_changed': {
      const bytes = typeof metadata.maxUploadSizeBytes === 'number' ? metadata.maxUploadSizeBytes : null;
      return bytes === null
        ? 'Max Upload Size Changed'
        : `Max Upload Size → ${formatBytes(bytes)}`;
    }

    case 'settings.open_registration_changed': {
      if (metadata.enabled === true) return 'Open Registration Enabled';
      if (metadata.enabled === false) return 'Open Registration Disabled';
      return 'Open Registration Changed';
    }

    case 'user.admin_granted': {
      return 'Admin Access Granted';
    }

    case 'user.admin_revoked': {
      return 'Admin Access Revoked';
    }

    case 'user.invitation_accepted': {
      return 'Invitation Accepted';
    }

    case 'user.invitation_sent': {
      return 'Invitation Sent';
    }

    case 'user.removed': {
      return 'User Removed';
    }

    case 'auth.signed_in': {
      return 'Signed In';
    }

    case 'auth.signed_out': {
      return 'Signed Out';
    }

    case 'auth.registered': {
      return 'Account Registered';
    }

    case 'auth.password_changed': {
      return 'Password Changed';
    }

    case 'auth.password_reset': {
      return 'Password Reset';
    }

    case 'auth.email_changed': {
      const previous = typeof metadata.previousEmail === 'string' ? metadata.previousEmail : null;
      const next = typeof metadata.newEmail === 'string' ? metadata.newEmail : null;
      return previous && next ? `Email Changed (${previous} → ${next})` : 'Email Changed';
    }

    case 'file.created': {
      return 'File Created';
    }

    case 'folder.created': {
      return 'Folder Created';
    }

    case 'file.uploaded': {
      return 'File Uploaded';
    }

    case 'file.moved': {
      return 'File Moved';
    }

    case 'authz.denied': {
      return 'Authorization Denied';
    }

    default: {
      return action;
    }
  }
}
