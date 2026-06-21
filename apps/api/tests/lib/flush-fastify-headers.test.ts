import { ServerResponse } from 'http';
import { flushFastifyHeadersToRaw } from '../../src/lib/flush-fastify-headers';

function makeReply(headers: Record<string, string | number | string[] | undefined>) {
  const raw = new ServerResponse({ method: 'GET' } as never);
  return {
    getHeaders: () => headers,
    raw,
  };
}

describe('flushFastifyHeadersToRaw', () => {
  test('copies string header to reply.raw', () => {
    const reply = makeReply({ 'x-custom': 'value' });
    flushFastifyHeadersToRaw(reply as never);
    expect(reply.raw.getHeader('x-custom')).toBe('value');
  });

  test('coerces number header to string', () => {
    const reply = makeReply({ 'content-length': 42 });
    flushFastifyHeadersToRaw(reply as never);
    expect(reply.raw.getHeader('content-length')).toBe('42');
  });

  test('coerces each element of a string[] header to string', () => {
    const reply = makeReply({ 'set-cookie': ['a=1', 'b=2'] });
    flushFastifyHeadersToRaw(reply as never);
    expect(reply.raw.getHeader('set-cookie')).toEqual(['a=1', 'b=2']);
  });

  test('skips undefined values', () => {
    const reply = makeReply({ 'x-missing': undefined });
    flushFastifyHeadersToRaw(reply as never);
    expect(reply.raw.getHeader('x-missing')).toBeUndefined();
  });
});
