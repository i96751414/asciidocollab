import { formatAuditAction, formatBytes } from '@/lib/audit-log-format';

describe('formatBytes', () => {
  test('bytes below 1 KB', () => expect(formatBytes(500)).toBe('500 B'));
  test('kilobytes', () => expect(formatBytes(2048)).toBe('2 KB'));
  test('megabytes', () => expect(formatBytes(5_242_880)).toBe('5.0 MB'));
  test('gigabytes', () => expect(formatBytes(1_073_741_824)).toBe('1.0 GB'));
});

describe('formatAuditAction', () => {
  test('UNAUTHORIZED_PAGE_ACCESS', () =>
    expect(formatAuditAction('UNAUTHORIZED_PAGE_ACCESS')).toBe('Unauthorized Access Attempt'));

  test('auth.email_verified', () =>
    expect(formatAuditAction('auth.email_verified')).toBe('Email Verified'));

  test('file.deleted', () => expect(formatAuditAction('file.deleted')).toBe('File Deleted'));
  test('file.renamed', () => expect(formatAuditAction('file.renamed')).toBe('File Renamed'));

  test('member.invited', () => expect(formatAuditAction('member.invited')).toBe('Member Invited'));
  test('member.removed', () => expect(formatAuditAction('member.removed')).toBe('Member Removed'));
  test('member.roleChanged', () => expect(formatAuditAction('member.roleChanged')).toBe('Member Role Changed'));

  test('project.archived', () => expect(formatAuditAction('project.archived')).toBe('Project Archived'));
  test('project.created', () => expect(formatAuditAction('project.created')).toBe('Project Created'));
  test('project.deleted', () => expect(formatAuditAction('project.deleted')).toBe('Project Deleted'));
  test('project.restored', () => expect(formatAuditAction('project.restored')).toBe('Project Restored'));
  test('project.updated', () => expect(formatAuditAction('project.updated')).toBe('Project Updated'));

  test('settings.max_upload_size_changed with metadata', () =>
    expect(formatAuditAction('settings.max_upload_size_changed', { maxUploadSizeBytes: 10_485_760 }))
      .toBe('Max Upload Size → 10.0 MB'));

  test('settings.max_upload_size_changed without metadata', () =>
    expect(formatAuditAction('settings.max_upload_size_changed')).toBe('Max Upload Size Changed'));

  test('settings.open_registration_changed enabled=true', () =>
    expect(formatAuditAction('settings.open_registration_changed', { enabled: true }))
      .toBe('Open Registration Enabled'));

  test('settings.open_registration_changed enabled=false', () =>
    expect(formatAuditAction('settings.open_registration_changed', { enabled: false }))
      .toBe('Open Registration Disabled'));

  test('settings.open_registration_changed no metadata', () =>
    expect(formatAuditAction('settings.open_registration_changed')).toBe('Open Registration Changed'));

  test('user.admin_granted', () =>
    expect(formatAuditAction('user.admin_granted')).toBe('Admin Access Granted'));

  test('user.admin_revoked', () =>
    expect(formatAuditAction('user.admin_revoked')).toBe('Admin Access Revoked'));

  test('user.invitation_accepted', () =>
    expect(formatAuditAction('user.invitation_accepted')).toBe('Invitation Accepted'));

  test('user.invitation_sent', () =>
    expect(formatAuditAction('user.invitation_sent')).toBe('Invitation Sent'));

  test('user.removed', () => expect(formatAuditAction('user.removed')).toBe('User Removed'));

  test('auth.signed_in', () => expect(formatAuditAction('auth.signed_in')).toBe('Signed In'));
  test('auth.signed_out', () => expect(formatAuditAction('auth.signed_out')).toBe('Signed Out'));
  test('auth.registered', () => expect(formatAuditAction('auth.registered')).toBe('Account Registered'));
  test('auth.password_changed', () =>
    expect(formatAuditAction('auth.password_changed')).toBe('Password Changed'));
  test('auth.password_reset', () =>
    expect(formatAuditAction('auth.password_reset')).toBe('Password Reset'));

  test('auth.email_changed with both emails shows the transition', () =>
    expect(formatAuditAction('auth.email_changed', { previousEmail: 'a@x.com', newEmail: 'b@x.com' }))
      .toBe('Email Changed (a@x.com → b@x.com)'));

  test('auth.email_changed without metadata falls back to the plain label', () =>
    expect(formatAuditAction('auth.email_changed')).toBe('Email Changed'));

  test('auth.email_changed with a missing side falls back to the plain label', () =>
    expect(formatAuditAction('auth.email_changed', { previousEmail: 'a@x.com' })).toBe('Email Changed'));

  test('file.created', () => expect(formatAuditAction('file.created')).toBe('File Created'));
  test('folder.created', () => expect(formatAuditAction('folder.created')).toBe('Folder Created'));
  test('file.uploaded', () => expect(formatAuditAction('file.uploaded')).toBe('File Uploaded'));
  test('file.moved', () => expect(formatAuditAction('file.moved')).toBe('File Moved'));
  test('authz.denied', () => expect(formatAuditAction('authz.denied')).toBe('Authorization Denied'));

  test('unknown action type falls back to raw string', () =>
    expect(formatAuditAction('some.unknown_action')).toBe('some.unknown_action'));
});
