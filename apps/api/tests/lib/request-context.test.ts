import type { FastifyRequest } from 'fastify';
import { requestContextFrom } from '../../src/lib/request-context';

function fakeRequest(ip: string, userAgent?: string): FastifyRequest {
  return { ip, headers: { 'user-agent': userAgent } } as unknown as FastifyRequest;
}

describe('requestContextFrom', () => {
  test('maps request.ip and user-agent into a RequestContext', () => {
    const context = requestContextFrom(fakeRequest('203.0.113.7', 'Mozilla/5.0'));
    expect(context).toEqual({ ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0' });
  });

  test('leaves userAgent undefined when the header is absent', () => {
    const context = requestContextFrom(fakeRequest('203.0.113.7'));
    expect(context.ipAddress).toBe('203.0.113.7');
    expect(context.userAgent).toBeUndefined();
  });
});
