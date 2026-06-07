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

  test('unknown action type falls back to raw string', () =>
    expect(formatAuditAction('some.unknown_action')).toBe('some.unknown_action'));
});
