import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('images route multipart limit', () => {
  const source = readFileSync(
    join(__dirname, '../../src/routes/projects/images.ts'),
    'utf8',
  );

  it('does not use a hardcoded 50 MB multipart file size limit', () => {
    expect(source).not.toMatch(/50\s*\*\s*1024\s*\*\s*1024/);
  });

  it('references config.storage.maxUploadSizeBytes for the multipart limit', () => {
    expect(source).toMatch(/config\.storage\.maxUploadSizeBytes/);
  });
});
