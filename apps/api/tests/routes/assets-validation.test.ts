import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('assets route — ValidationError branching', () => {
  const source = readFileSync(
    join(__dirname, '../../src/routes/projects/assets.ts'),
    'utf8',
  );

  it('source contains explicit handling for the empty-file message', () => {
    expect(source).toMatch(/File must not be empty/);
  });

  it('ValidationError block contains a 400 response for the empty-file case', () => {
    // Find the ValidationError handler block and verify it has a status(400) branch
    const validationBlock = source.match(
      /instanceof ValidationError\)([\s\S]*?)(?=if \(result\.error instanceof FileConflictError)/
    )?.[1] ?? '';
    expect(validationBlock).toMatch(/status\(400\)/);
  });

  it('route validates parentId presence before passing to FileNodeId.create', () => {
    // The route must either have a Fastify schema requiring parentId,
    // or an explicit guard before FileNodeId.create
    const hasGuard =
      source.includes("if (!request.query.parentId)") ||
      source.includes('if (!parentId)') ||
      source.includes('parentId == null') ||
      source.includes('parentId === undefined') ||
      source.includes("required: ['parentId']") ||
      source.includes('required: ["parentId"]');
    expect(hasGuard).toBe(true);
  });
});
