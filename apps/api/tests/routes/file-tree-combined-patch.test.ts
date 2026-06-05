import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('file-tree route — combined rename+move PATCH', () => {
  const source = readFileSync(
    path.join(__dirname, '../../src/routes/projects/file-tree-patch.ts'),
    'utf8',
  );

  it('emits a fileTreeEventBus event in the combined name+parentId PATCH branch', () => {
    // Find the combined-branch block: between "name !== undefined && parentId !== undefined" and the next "} else if"
    const combinedBranchMatch = source.match(
      /name !== undefined && parentId !== undefined\)([\s\S]*?)(?=} else if \(name)/,
    );
    expect(combinedBranchMatch).not.toBeNull();
    const combinedBranch = combinedBranchMatch![1];
    expect(combinedBranch).toContain('fileTreeEventBus.emit');
  });

  it('the combined branch emits a moved event with the correct parentId field', () => {
    const combinedBranchMatch = source.match(
      /name !== undefined && parentId !== undefined\)([\s\S]*?)(?=} else if \(name)/,
    );
    const combinedBranch = combinedBranchMatch![1];
    // Must contain the event emission
    expect(combinedBranch).toMatch(/type:\s*['"]moved['"]/);
    expect(combinedBranch).toMatch(/parentId/);
  });
});
