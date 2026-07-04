import { createMaxPayloadGuard } from '../src/server';
import type { beforeHandleMessagePayload } from '@hocuspocus/server';

function payloadOfSize(bytes: number): beforeHandleMessagePayload {
  return { update: new Uint8Array(bytes) } as unknown as beforeHandleMessagePayload;
}

// An inbound message larger than the limit is rejected
// (closed) without crashing the server; within-limit messages pass.
describe('createMaxPayloadGuard', () => {
  it('rejects a message exceeding the limit with WS code 1009 (Message Too Big)', async () => {
    const guard = createMaxPayloadGuard(1024);
    await expect(guard(payloadOfSize(1025))).rejects.toMatchObject({ code: 1009 });
  });

  it('accepts a message at or under the limit', async () => {
    const guard = createMaxPayloadGuard(1024);
    await expect(guard(payloadOfSize(1024))).resolves.toBeUndefined();
    await expect(guard(payloadOfSize(0))).resolves.toBeUndefined();
  });
});
