import { CannotRemoveLastAdminError } from '../src/errors/cannot-remove-last-admin';
import { InvalidProjectNameError } from '../src/errors/invalid-project-name';

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
