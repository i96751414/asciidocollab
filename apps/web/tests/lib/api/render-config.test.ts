import { renderConfigApi } from '@/lib/api/render-config';
import { apiRequest } from '@/lib/api/transport';

jest.mock('@/lib/api/transport', () => ({ apiRequest: jest.fn() }));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('renderConfigApi', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ data: {} } as never);
  });

  it('GETs the project render-config endpoint', async () => {
    await renderConfigApi.get('proj-1');
    expect(mockApiRequest).toHaveBeenCalledWith('/api/projects/proj-1/render-config');
  });

  it('PUTs the config as a JSON body', async () => {
    await renderConfigApi.save('proj-1', { doctype: 'book' });
    expect(mockApiRequest).toHaveBeenCalledWith('/api/projects/proj-1/render-config', {
      method: 'PUT',
      body: JSON.stringify({ doctype: 'book' }),
    });
  });

  it('returns the response envelope', async () => {
    mockApiRequest.mockResolvedValue({ data: { media: 'print' } } as never);
    await expect(renderConfigApi.get('proj-1')).resolves.toEqual({ data: { media: 'print' } });
  });
});
