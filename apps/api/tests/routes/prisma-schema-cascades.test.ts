import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Prisma schema — cascade delete invariants', () => {
  const schema = readFileSync(
    join(__dirname, '../../../../packages/db/prisma/schema.prisma'),
    'utf8',
  );

  it('Asset.project relation has onDelete: Cascade so project deletion does not fail with FK violation', () => {
    // Find the Asset model block
    const assetModelMatch = schema.match(/model Asset \{([\s\S]*?)\n\}/);
    expect(assetModelMatch).not.toBeNull();
    const assetModel = assetModelMatch![1];
    // The project relation line must include onDelete: Cascade
    expect(assetModel).toMatch(/onDelete:\s*Cascade/);
  });
});
