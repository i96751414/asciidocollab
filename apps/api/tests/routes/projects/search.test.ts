import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { ProjectId, FileNodeId, FileNode, FileNodeType, FilePath } from '@asciidocollab/domain';
import { Re2RegexEngine } from '@asciidocollab/infrastructure';
import { projectSearchRoutes } from '../../../src/routes/projects/search';

jest.mock('../../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_request: unknown, _rep: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440002';
const ROOT_ID = '550e8400-e29b-41d4-a716-446655440003';
const ALPHA_ID = '550e8400-e29b-41d4-a716-446655440004';
const BETA_ID = '550e8400-e29b-41d4-a716-446655440005';

function nodes(): FileNode[] {
  return [
    new FileNode(FileNodeId.create(ROOT_ID), ProjectId.create(PROJECT_ID), null, 'Root', FileNodeType.create('folder'), FilePath.create('/')),
    new FileNode(FileNodeId.create(ALPHA_ID), ProjectId.create(PROJECT_ID), FileNodeId.create(ROOT_ID), 'alpha.adoc', FileNodeType.create('file'), FilePath.create('/alpha.adoc')),
    new FileNode(FileNodeId.create(BETA_ID), ProjectId.create(PROJECT_ID), FileNodeId.create(ROOT_ID), 'beta.txt', FileNodeType.create('file'), FilePath.create('/beta.txt')),
  ];
}

interface ServerOptions {
  isMember?: boolean;
  store?: Map<string, string>;
}

async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const { isMember = true } = options;
  const store = options.store ?? new Map<string, string>([['/alpha.adoc', 'foo bar\nfoo baz\n'], ['/beta.txt', 'nothing here\n']]);
  const app = Fastify();
  await app.register(rateLimit, { global: false });
  app.decorate('config', {
    project: {
      search: {
        rateLimitMax: 120,
        rateLimitWindow: 60_000,
        replaceRateLimitMax: 30,
        replaceRateLimitWindow: 60_000,
        maxMatchesReturned: 1000,
        maxPatternLength: 1000,
        perFileTimeBudgetMs: 250,
        maxFileBytes: 2_000_000,
      },
    },
  } as never);
  app.decorate('repos', {
    projectMember: { findByCompositeKey: jest.fn(async () => (isMember ? { role: { value: 'viewer' } } : null)) },
    fileNode: { findByProjectId: jest.fn(async () => nodes()) },
    document: { findByFileNodeId: jest.fn(async () => null) },
  } as never);
  app.decorate('stores', {
    fileStore: {
      read: jest.fn(async (_p: unknown, path: { value: string }) => {
        const content = store.get(path.value);
        return content === undefined ? null : Buffer.from(content, 'utf8');
      }),
    },
    regexEngine: new Re2RegexEngine(),
    collaborativeContentEditor: { readContent: jest.fn(async () => ({ success: true, value: null })) },
  } as never);
  await app.register(projectSearchRoutes);
  await app.ready();
  return app;
}

const search = (app: FastifyInstance, body: unknown) =>
  app.inject({ method: 'POST', url: `/projects/${PROJECT_ID}/search`, payload: body });

describe('POST /projects/:projectId/search', () => {
  test('200 — groups matches by file with a true total, mapping ids to strings', async () => {
    const app = await buildServer();
    const response = await search(app, { query: 'foo', mode: 'literal', caseSensitive: true, wholeWord: false });
    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0]).toMatchObject({ fileNodeId: ALPHA_ID, path: 'alpha.adoc', matchCount: 2 });
    expect(data.totalMatches).toBe(2);
    expect(data.capped).toBe(false);
    await app.close();
  });

  test('200 — regex mode matches with capture groups', async () => {
    const app = await buildServer({ store: new Map([['/alpha.adoc', 'ref 2026-07\n'], ['/beta.txt', '']]) });
    const response = await search(app, { query: '(\\d{4})-(\\d{2})', mode: 'regex', caseSensitive: true, wholeWord: false });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.groups[0].matches[0].matchText).toBe('2026-07');
    await app.close();
  });

  test('400 INVALID_PATTERN — an invalid regex is rejected, not run', async () => {
    const app = await buildServer();
    const response = await search(app, { query: '(unclosed', mode: 'regex', caseSensitive: true, wholeWord: false });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PATTERN');
    await app.close();
  });

  test('403 FORBIDDEN — a non-member cannot search', async () => {
    const app = await buildServer({ isMember: false });
    const response = await search(app, { query: 'foo', mode: 'literal', caseSensitive: true, wholeWord: false });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });

  test('400 — schema rejects an empty query', async () => {
    const app = await buildServer();
    const response = await search(app, { query: '', mode: 'literal', caseSensitive: true, wholeWord: false });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  test('400 — schema rejects an unknown mode', async () => {
    const app = await buildServer();
    const response = await search(app, { query: 'foo', mode: 'glob', caseSensitive: true, wholeWord: false });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
