import { AuditLog } from '../../src/entities/audit-log';
import { AuditLogId } from '../../src/value-objects/ids/audit-log-id';
import { UserId } from '../../src/value-objects/ids/user-id';
import { ProjectId } from '../../src/value-objects/ids/project-id';

describe('AuditLog entity', () => {
  const logId = AuditLogId.create('550e8400-e29b-41d4-a716-446655440000');
  const userId = UserId.create('550e8400-e29b-41d4-a716-446655440001');

  test('creates with all required fields', () => {
    const entry = new AuditLog(
      logId,
      userId,
      null,
      'project.created',
      'Project',
      '550e8400-e29b-41d4-a716-446655440010',
      new Date('2026-05-26T12:00:00Z'),
      { projectName: 'Test Project' },
    );
    expect(entry.id).toBe(logId);
    expect(entry.userId).toBe(userId);
    expect(entry.projectId).toBeNull();
    expect(entry.action).toBe('project.created');
    expect(entry.resourceType).toBe('Project');
    expect(entry.resourceId).toBe('550e8400-e29b-41d4-a716-446655440010');
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(entry.metadata).toEqual({ projectName: 'Test Project' });
  });

  test('creates with optional projectId', () => {
    const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440020');
    const entry = new AuditLog(
      logId,
      userId,
      projectId,
      'member.invited',
      'ProjectMember',
      '550e8400-e29b-41d4-a716-446655440030',
      new Date(),
      { invitedEmail: 'user@example.com', role: 'editor' },
    );
    expect(entry.projectId).toBe(projectId);
  });

  test('tracks different actions and resource types', () => {
    const entry = new AuditLog(
      logId,
      userId,
      null,
      'file.renamed',
      'FileNode',
      '550e8400-e29b-41d4-a716-446655440040',
      new Date(),
      { oldName: 'old.adoc', newName: 'new.adoc' },
    );
    expect(entry.action).toBe('file.renamed');
    expect(entry.resourceType).toBe('FileNode');
  });

  test('timestamp is set on creation', () => {
    const now = new Date();
    const entry = new AuditLog(
      logId,
      userId,
      null,
      'project.created',
      'Project',
      '550e8400-e29b-41d4-a716-446655440050',
      now,
      {},
    );
    expect(entry.timestamp).toBe(now);
  });

  test('metadata stores arbitrary JSON', () => {
    const entry = new AuditLog(
      logId,
      userId,
      null,
      'member.roleChanged',
      'ProjectMember',
      '550e8400-e29b-41d4-a716-446655440060',
      new Date(),
      { oldRole: 'viewer', newRole: 'editor', changedBy: 'admin' },
    );
    expect(entry.metadata.oldRole).toBe('viewer');
    expect(entry.metadata.newRole).toBe('editor');
    expect(entry.metadata.changedBy).toBe('admin');
  });
});
