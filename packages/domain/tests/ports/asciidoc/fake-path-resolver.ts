import { PathResolver, SandboxedPathResult } from '../../../src/ports/asciidoc/path-resolver';

/**
 * Faithful in-memory PathResolver fake for domain unit tests. Implements the
 * same traversal/scheme rejection and relative-path inverse as the shared
 * `resolveSandboxedPath` / `relativeProjectPath`; the production wiring injects
 * the real shared implementation (exercised end-to-end by the e2e/integration
 * suites).
 */
export class FakePathResolver implements PathResolver {
  resolveSandboxedPath(fromPath: string, target: string): SandboxedPathResult {
    const trimmed = target.trim();
    if (trimmed === '') return { ok: false, reason: 'empty' };
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) return { ok: false, reason: 'remote' };
    if (trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(trimmed)) {
      return { ok: false, reason: 'absolute' };
    }
    const segments = fromPath.replace(/^\/+/, '').split('/').slice(0, -1);
    for (const segment of trimmed.replaceAll('\\', '/').split('/')) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        if (segments.length === 0) return { ok: false, reason: 'traversal' };
        segments.pop();
        continue;
      }
      segments.push(segment);
    }
    if (segments.length === 0) return { ok: false, reason: 'traversal' };
    return { ok: true, path: segments.join('/') };
  }

  relativeProjectPath(fromFile: string, toFile: string): string {
    const from = fromFile.replace(/^\/+/, '').split('/');
    const to = toFile.replace(/^\/+/, '').split('/');
    const fromDirectory = from.slice(0, -1);
    let common = 0;
    while (common < fromDirectory.length && common < to.length - 1 && fromDirectory[common] === to[common]) {
      common += 1;
    }
    const ups = fromDirectory.length - common;
    const segments = [...Array.from({ length: ups }, () => '..'), ...to.slice(common)];
    return segments.length > 0 ? segments.join('/') : (to.at(-1) ?? '');
  }
}
