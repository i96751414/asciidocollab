import {
  createProjectSchema,
  updateProjectSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  projectLanguageSchema,
  PROJECT_LANGUAGES,
} from '../../src/schemas';

// Covers the schemas barrel re-export itself (its value getters), not just `./project` directly —
// otherwise the barrel's re-exported runtime bindings register as uncovered functions.
describe('schemas barrel re-exports', () => {
  it('re-exports the project/member runtime schemas as usable Zod schemas', () => {
    expect(createProjectSchema.parse({ name: 'Doc' })).toMatchObject({ name: 'Doc' });
    expect(updateProjectSchema.parse({ name: 'Doc' })).toMatchObject({ name: 'Doc' });
    expect(inviteMemberSchema.parse({ email: 'a@b.com', role: 'editor' })).toMatchObject({ role: 'editor' });
    expect(updateMemberRoleSchema.parse({ role: 'editor' })).toMatchObject({ role: 'editor' });
  });

  it('re-exports the project-language schema and the supported-language list', () => {
    expect(Array.isArray(PROJECT_LANGUAGES)).toBe(true);
    expect(PROJECT_LANGUAGES.length).toBeGreaterThan(0);
    expect(projectLanguageSchema.parse(PROJECT_LANGUAGES[0])).toBe(PROJECT_LANGUAGES[0]);
  });
});
