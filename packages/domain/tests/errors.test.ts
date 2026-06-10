import { CannotRemoveLastAdminError } from '../src/errors/cannot-remove-last-admin';
import { InvalidProjectNameError } from '../src/errors/invalid-project-name';
import { PermissionDeniedError } from '../src/errors/permission-denied';

describe('CannotRemoveLastAdminError', () => {
  it('uses system-level message when no context is provided', () => {
    const error = new CannotRemoveLastAdminError();
    expect(error.message).toContain('system administrator');
    expect(error.name).toBe('CannotRemoveLastAdminError');
  });

  it('uses project-scoped message when context is provided', () => {
    const error = new CannotRemoveLastAdminError('project-abc');
    expect(error.message).toContain('project-abc');
    expect(error.name).toBe('CannotRemoveLastAdminError');
  });
});

describe('InvalidProjectNameError', () => {
  it('uses the default "Invalid project name" message when none is provided', () => {
    const error = new InvalidProjectNameError();
    expect(error.message).toBe('Invalid project name');
    expect(error.name).toBe('InvalidProjectNameError');
  });

  it('uses a custom message when one is provided', () => {
    const error = new InvalidProjectNameError('Project name must not exceed 100 characters');
    expect(error.message).toBe('Project name must not exceed 100 characters');
  });
});

describe('PermissionDeniedError', () => {
  it('uses defaults and leaves optional context undefined when not provided', () => {
    const error = new PermissionDeniedError();
    expect(error.message).toBe('Permission denied');
    expect(error.name).toBe('PermissionDeniedError');
    expect(error.resourceType).toBeUndefined();
    expect(error.resourceId).toBeUndefined();
    expect(error.reason).toBeUndefined();
  });

  it('stores the optional resource context when provided', () => {
    const error = new PermissionDeniedError('Nope', 'FileNode', 'file-1', 'role:viewer');
    expect(error.message).toBe('Nope');
    expect(error.resourceType).toBe('FileNode');
    expect(error.resourceId).toBe('file-1');
    expect(error.reason).toBe('role:viewer');
  });
});
