import { Template } from '../../src/entities/template';
import { TemplateId } from '../../src/value-objects/ids/template-id';
import { TemplateCategory } from '../../src/value-objects/project/template-category';
import { ProjectId } from '../../src/value-objects/ids/project-id';

describe('Template entity', () => {
  const templateId = TemplateId.create('550e8400-e29b-41d4-a716-446655440000');

  test('creates with all required fields', () => {
    const tpl = new Template(
      templateId,
      'API Docs',
      'Template for API documentation',
      TemplateCategory.create('documentation'),
      null,
      new Date('2026-05-26T12:00:00Z'),
    );
    expect(tpl.id).toBe(templateId);
    expect(tpl.name).toBe('API Docs');
    expect(tpl.description).toBe('Template for API documentation');
    expect(tpl.category.value).toBe('documentation');
    expect(tpl.sourceProjectId).toBeNull();
    expect(tpl.createdAt).toBeInstanceOf(Date);
  });

  test('creates with optional sourceProjectId', () => {
    const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440001');
    const tpl = new Template(
      templateId,
      'Project Template',
      null,
      TemplateCategory.create('general'),
      projectId,
      new Date('2026-05-26T12:00:00Z'),
    );
    expect(tpl.sourceProjectId).toBe(projectId);
  });

  test('creates without description', () => {
    const tpl = new Template(
      templateId,
      'Minimal',
      null,
      TemplateCategory.create('general'),
      null,
      new Date('2026-05-26T12:00:00Z'),
    );
    expect(tpl.description).toBeNull();
  });

  test('accepts valid TemplateCategory values', () => {
    const tpl = new Template(
      templateId,
      'Docs',
      null,
      TemplateCategory.create('documentation'),
      null,
      new Date('2026-05-26T12:00:00Z'),
    );
    expect(tpl.category.value).toBe('documentation');
  });

  test('rejects empty TemplateCategory', () => {
    expect(() => TemplateCategory.create('')).toThrow();
  });

  test('rejects TemplateCategory over 50 characters', () => {
    expect(() => TemplateCategory.create('a'.repeat(51))).toThrow();
  });
});
