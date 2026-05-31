import { Project } from '../../src/entities/project';
import { ProjectId } from '../../src/value-objects/project-id';
import { ProjectName } from '../../src/value-objects/project-name';
import { FileNodeId } from '../../src/value-objects/file-node-id';

describe('Project entity', () => {
  const projectId = ProjectId.create('550e8400-e29b-41d4-a716-446655440000');
  const projectName = ProjectName.create('Test Project');

  test('creates with name', () => {
    const project = new Project(projectId, projectName, null, [], null);
    expect(project.id).toBe(projectId);
    expect(project.name).toBe(projectName);
    expect(project.description).toBeNull();
    expect(project.tags).toEqual([]);
    expect(project.rootFolderId).toBeNull();
    expect(project.archivedAt).toBeNull();
    expect(project.createdAt).toBeInstanceOf(Date);
    expect(project.updatedAt).toBeInstanceOf(Date);
  });

  test('rootFolderId is initially null and can be set', () => {
    const project = new Project(projectId, projectName, null, [], null);
    expect(project.rootFolderId).toBeNull();

    const folderId = FileNodeId.create('550e8400-e29b-41d4-a716-446655440002');
    project.setRootFolderId(folderId);
    expect(project.rootFolderId).toBe(folderId);
  });

  test('removes duplicate tags', () => {
    const project = new Project(
      projectId,
      projectName,
      null,
      ['frontend', 'backend', 'frontend', 'docs', 'backend'],
      null,
    );
    expect(project.tags).toEqual(['frontend', 'backend', 'docs']);
  });

  test('enforces maximum of 10 tags', () => {
    const tags = Array.from({ length: 11 }, (_, index) => `tag-${index}`);
    expect(
      () => new Project(projectId, projectName, null, tags, null),
    ).toThrow();
  });

  test('archivedAt can only be set once', () => {
    const project = new Project(projectId, projectName, null, [], null);
    expect(project.archivedAt).toBeNull();

    project.archive();
    expect(project.archivedAt).toBeInstanceOf(Date);

    expect(() => project.archive()).toThrow();
  });
});
