import { ProjectMember } from '../../src/entities/project-member';
import { ProjectId } from '../../src/value-objects/project-id';
import { UserId } from '../../src/value-objects/user-id';
import { Role } from '../../src/value-objects/role';

describe('ProjectMember entity', () => {
  const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440000');
  const userId = UserId.create('550e8400-e29b-41d4-a716-446655440001');
  const joinedAt = new Date('2026-05-26T12:00:00Z');

  test('creates with projectId, userId, and role', () => {
    const pm = new ProjectMember(projectId, userId, Role.create('editor'), joinedAt);
    expect(pm.projectId).toBe(projectId);
    expect(pm.userId).toBe(userId);
    expect(pm.role.value).toBe('editor');
  });

  test('accepts viewer role', () => {
    const pm = new ProjectMember(projectId, userId, Role.create('viewer'), joinedAt);
    expect(pm.role.value).toBe('viewer');
  });

  test('accepts editor role', () => {
    const pm = new ProjectMember(projectId, userId, Role.create('editor'), joinedAt);
    expect(pm.role.value).toBe('editor');
  });

  test('accepts administrator role', () => {
    const pm = new ProjectMember(projectId, userId, Role.create('administrator'), joinedAt);
    expect(pm.role.value).toBe('administrator');
  });

  test('rejects invalid role', () => {
    expect(() => Role.create('superadmin')).toThrow();
  });

  test('joinedAt is set on creation', () => {
    const now = new Date();
    const pm = new ProjectMember(projectId, userId, Role.create('viewer'), now);
    expect(pm.joinedAt).toBe(now);
  });

  test('implements role equals', () => {
    const a = Role.create('editor');
    const b = Role.create('editor');
    const c = Role.create('viewer');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
