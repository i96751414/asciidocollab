import { CannotRemoveLastAdminError } from '../src/errors/cannot-remove-last-admin';
import { InvalidProjectNameError } from '../src/errors/invalid-project-name';

describe('CannotRemoveLastAdminError', () => {
  it('uses system-level message when no context is provided', () => {
    const err = new CannotRemoveLastAdminError();
    expect(err.message).toContain('system administrator');
    expect(err.name).toBe('CannotRemoveLastAdminError');
  });

  it('uses project-scoped message when context is provided', () => {
    const err = new CannotRemoveLastAdminError('project-abc');
    expect(err.message).toContain('project-abc');
    expect(err.name).toBe('CannotRemoveLastAdminError');
  });
});

describe('InvalidProjectNameError', () => {
  it('uses the default "Invalid project name" message when none is provided', () => {
    const err = new InvalidProjectNameError();
    expect(err.message).toBe('Invalid project name');
    expect(err.name).toBe('InvalidProjectNameError');
  });

  it('uses a custom message when one is provided', () => {
    const err = new InvalidProjectNameError('Project name must not exceed 100 characters');
    expect(err.message).toBe('Project name must not exceed 100 characters');
  });
});
