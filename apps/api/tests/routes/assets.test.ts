import Fastify from 'fastify';
import {
  UploadAssetUseCase,
  GetAssetContentUseCase,
  PermissionDeniedError,
  FileNodeNotFoundError,
  FileConflictError,
  ValidationError,
  ContentNotFoundError,
} from '@asciidocollab/domain';
import { assetsRoutes } from '../../src/routes/projects/assets';

jest.mock('../../src/plugins/require-auth', () => ({
  requireAuth: jest.fn((_request: unknown, _reply: unknown, done: () => void) => done()),
  getAuthenticatedUserId: jest.fn(() => '550e8400-e29b-41d4-a716-446655440001'),
}));

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440002';
const PARENT_ID = '550e8400-e29b-41d4-a716-446655440003';
const ASSET_ID = '550e8400-e29b-41d4-a716-446655440004';

async function buildTestServer() {
  const app = Fastify();
  app.decorate('repos', {
    projectMember: { findByCompositeKey: jest.fn().mockResolvedValue({ role: { value: 'editor' } }) },
    fileNode: { findById: jest.fn().mockResolvedValue(null) },
    asset: { findById: jest.fn().mockResolvedValue(null), save: jest.fn() },
    systemSetting: { get: jest.fn().mockResolvedValue(null) },
  } as never);
  app.decorate('stores', {
    fileStore: { write: jest.fn().mockResolvedValue(undefined), read: jest.fn().mockResolvedValue(Buffer.from('img')) },
  } as never);
  app.decorate('config', { storage: { maxUploadSizeBytes: 20_971_520 } } as never);
  app.decorate('fileTreeEventBus', { emit: jest.fn() } as never);
  await app.register(assetsRoutes);
  await app.ready();
  return app;
}

function multipartBody(filename: string | null) {
  if (!filename) {
    return '--boundary\r\nContent-Disposition: form-data; name="text"\r\n\r\nvalue\r\n--boundary--';
  }
  return [
    '--boundary',
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    'Content-Type: image/png',
    '',
    'iVBORw0KGgo=',
    '--boundary--',
  ].join('\r\n');
}

const multipartHeaders = { 'content-type': 'multipart/form-data; boundary=boundary' };

describe('POST /projects/:projectId/assets', () => {
  it('returns 201 with assetId on success', async () => {
    jest.spyOn(UploadAssetUseCase.prototype, 'execute').mockResolvedValue({
      success: true,
      value: {
        fileNodeId: { value: ASSET_ID } as never,
        storagePath: `/assets/${ASSET_ID}`,
      },
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/assets?parentId=${PARENT_ID}`,
      headers: multipartHeaders,
      payload: multipartBody('image.png'),
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.assetId).toBe(ASSET_ID);
    await app.close();
  });

  it('returns 400 when no file is provided', async () => {
    const app = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/assets?parentId=${PARENT_ID}`,
      headers: multipartHeaders,
      payload: multipartBody(null),
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('returns 403 on PermissionDeniedError', async () => {
    jest.spyOn(UploadAssetUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new PermissionDeniedError(),
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/assets?parentId=${PARENT_ID}`,
      headers: multipartHeaders,
      payload: multipartBody('image.png'),
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe('FORBIDDEN');
    await app.close();
  });

  it('returns 415 on ValidationError mentioning MIME type', async () => {
    jest.spyOn(UploadAssetUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new ValidationError('Unsupported MIME type: application/x-executable'),
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/assets?parentId=${PARENT_ID}`,
      headers: multipartHeaders,
      payload: multipartBody('bad.exe'),
    });

    expect(response.statusCode).toBe(415);
    expect(JSON.parse(response.body).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    await app.close();
  });

  it('returns 413 on ValidationError for file too large', async () => {
    jest.spyOn(UploadAssetUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new ValidationError('File exceeds maximum size limit'),
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/assets?parentId=${PARENT_ID}`,
      headers: multipartHeaders,
      payload: multipartBody('huge.bin'),
    });

    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body).error.code).toBe('FILE_TOO_LARGE');
    await app.close();
  });

  it('returns 409 on FileConflictError', async () => {
    jest.spyOn(UploadAssetUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new FileConflictError('image.png'),
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/assets?parentId=${PARENT_ID}`,
      headers: multipartHeaders,
      payload: multipartBody('image.png'),
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe('CONFLICT');
    await app.close();
  });

  it('returns 404 on FileNodeNotFoundError', async () => {
    jest.spyOn(UploadAssetUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new FileNodeNotFoundError(PARENT_ID),
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/assets?parentId=${PARENT_ID}`,
      headers: multipartHeaders,
      payload: multipartBody('image.png'),
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns 500 for unrecognised error', async () => {
    jest.spyOn(UploadAssetUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new Error('db down') as never,
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/assets?parentId=${PARENT_ID}`,
      headers: multipartHeaders,
      payload: multipartBody('image.png'),
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error.code).toBe('INTERNAL_ERROR');
    await app.close();
  });
});

describe('GET /projects/:projectId/assets/:assetId', () => {
  const mockBytes = Buffer.from('PNG_DATA');
  const successValue = {
    bytes: mockBytes,
    mimeType: { value: 'image/png' },
    filename: 'image.png',
  };

  it('returns 200 with content-type and content-disposition headers', async () => {
    jest.spyOn(GetAssetContentUseCase.prototype, 'execute').mockResolvedValue({
      success: true,
      value: successValue as never,
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/assets/${ASSET_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['content-disposition']).toContain('image.png');
    await app.close();
  });

  it('returns 403 on PermissionDeniedError', async () => {
    jest.spyOn(GetAssetContentUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new PermissionDeniedError(),
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/assets/${ASSET_ID}`,
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 on FileNodeNotFoundError', async () => {
    jest.spyOn(GetAssetContentUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new FileNodeNotFoundError(ASSET_ID),
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/assets/${ASSET_ID}`,
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns 404 on ContentNotFoundError', async () => {
    jest.spyOn(GetAssetContentUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new ContentNotFoundError(ASSET_ID),
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/assets/${ASSET_ID}`,
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns 500 for unrecognised error', async () => {
    jest.spyOn(GetAssetContentUseCase.prototype, 'execute').mockResolvedValue({
      success: false,
      error: new Error('storage error') as never,
    });

    const app = await buildTestServer();
    const response = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/assets/${ASSET_ID}`,
    });

    expect(response.statusCode).toBe(500);
    await app.close();
  });
});
