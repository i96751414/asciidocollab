import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FilePath } from '@asciidocollab/domain';

describe('file-tree route — POST /projects/:projectId/files', () => {
  const source = readFileSync(
    path.join(__dirname, '../../src/routes/projects/file-tree-create.ts'),
    'utf8',
  );

  describe('FilePath — spaces in names', () => {
    it('accepts a file name with spaces', () => {
      expect(() => FilePath.create('/my document.adoc')).not.toThrow();
      expect(FilePath.create('/my document.adoc').value).toBe('/my document.adoc');
    });

    it('accepts a folder name with spaces', () => {
      expect(() => FilePath.create('/my folder')).not.toThrow();
      expect(FilePath.create('/my folder').value).toBe('/my folder');
    });

    it('accepts a deeply-nested path where a segment has spaces', () => {
      expect(() => FilePath.create('/my docs/sub folder/file.adoc')).not.toThrow();
    });
  });

  it('emits a fileTreeEventBus event after a file is successfully created', () => {
    // The file-creation branch (type === 'file') must emit via fileTreeEventBus
    const fileBranchMatch = source.match(/} else \{([\s\S]*?)return reply\.status\(201\)/);
    expect(fileBranchMatch).not.toBeNull();
    const fileBranch = fileBranchMatch![1];
    expect(fileBranch).toContain('fileTreeEventBus.emit');
  });

  it('emits a fileTreeEventBus event after a folder is successfully created', () => {
    // The folder-creation branch (type === 'folder') must emit via fileTreeEventBus
    const folderBranchMatch = source.match(/if \(type === 'folder'\) \{([\s\S]*?)return reply\.status\(201\)/);
    expect(folderBranchMatch).not.toBeNull();
    const folderBranch = folderBranchMatch![1];
    expect(folderBranch).toContain('fileTreeEventBus.emit');
  });

  it('the file-created event carries type "created" and parentId', () => {
    const fileBranchMatch = source.match(/} else \{([\s\S]*?)return reply\.status\(201\)/);
    const fileBranch = fileBranchMatch![1];
    expect(fileBranch).toMatch(/type:\s*['"]created['"]/);
    expect(fileBranch).toMatch(/parentId/);
  });

  it('the folder-created event carries type "created" and parentId', () => {
    const folderBranchMatch = source.match(/if \(type === 'folder'\) \{([\s\S]*?)return reply\.status\(201\)/);
    const folderBranch = folderBranchMatch![1];
    expect(folderBranch).toMatch(/type:\s*['"]created['"]/);
    expect(folderBranch).toMatch(/parentId/);
  });
});
