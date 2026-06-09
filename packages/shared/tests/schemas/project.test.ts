import {
  createProjectSchema,
  updateProjectSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
} from '../../src/schemas/project';

describe('createProjectSchema', () => {
  test('accepts a valid project and applies default tags', () => {
    const result = createProjectSchema.parse({ name: 'My Project' });
    expect(result.name).toBe('My Project');
    expect(result.tags).toEqual([]);
  });

  test('accepts description and tags', () => {
    const result = createProjectSchema.parse({
      name: 'My Project',
      description: 'A description',
      tags: ['docs', 'frontend'],
    });
    expect(result.description).toBe('A description');
    expect(result.tags).toEqual(['docs', 'frontend']);
  });

  test('accepts a null description', () => {
    const result = createProjectSchema.parse({ name: 'My Project', description: null });
    expect(result.description).toBeNull();
  });

  test('rejects an empty name', () => {
    expect(() => createProjectSchema.parse({ name: '' })).toThrow(/Project name is required/);
  });

  test('rejects a name over 100 characters', () => {
    expect(() => createProjectSchema.parse({ name: 'a'.repeat(101) })).toThrow(
      /100 characters or less/,
    );
  });

  test('rejects a description over 1000 characters', () => {
    expect(() =>
      createProjectSchema.parse({ name: 'My Project', description: 'a'.repeat(1001) }),
    ).toThrow(/1000 characters or less/);
  });

  test('rejects a tag over 50 characters', () => {
    expect(() =>
      createProjectSchema.parse({ name: 'My Project', tags: ['a'.repeat(51)] }),
    ).toThrow(/50 characters or less/);
  });

  test('rejects more than 10 tags', () => {
    expect(() =>
      createProjectSchema.parse({ name: 'My Project', tags: Array.from({ length: 11 }, () => 'tag') }),
    ).toThrow(/Maximum 10 tags allowed/);
  });
});

describe('updateProjectSchema', () => {
  test('accepts a partial update', () => {
    const result = updateProjectSchema.parse({ name: 'Renamed' });
    expect(result.name).toBe('Renamed');
  });

  test('accepts an empty object (all fields optional)', () => {
    expect(updateProjectSchema.parse({})).toEqual({});
  });

  test('rejects an empty name when provided', () => {
    expect(() => updateProjectSchema.parse({ name: '' })).toThrow(/Project name is required/);
  });
});

describe('inviteMemberSchema', () => {
  test('accepts a valid invitation', () => {
    const result = inviteMemberSchema.parse({ email: 'user@example.com', role: 'editor' });
    expect(result.email).toBe('user@example.com');
    expect(result.role).toBe('editor');
  });

  test('rejects an invalid email', () => {
    expect(() => inviteMemberSchema.parse({ email: 'not-an-email', role: 'editor' })).toThrow(
      /Invalid email address/,
    );
  });

  test('rejects an invalid role', () => {
    expect(() =>
      inviteMemberSchema.parse({ email: 'user@example.com', role: 'superuser' }),
    ).toThrow();
  });
});

describe('updateMemberRoleSchema', () => {
  test.each(['viewer', 'editor', 'owner'] as const)('accepts the %s role', (role) => {
    expect(updateMemberRoleSchema.parse({ role }).role).toBe(role);
  });

  test('rejects an invalid role', () => {
    expect(() => updateMemberRoleSchema.parse({ role: 'admin' })).toThrow();
  });
});
