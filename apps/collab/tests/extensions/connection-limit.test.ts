import { ConnectionLimitExtension } from '../../src/extensions/connection-limit';
import type { onConnectPayload, onDisconnectPayload } from '@hocuspocus/server';

const ROOM_A = 'p1/doc-a';
const ROOM_B = 'p1/doc-b';

function connectPayload(userId: string, socketId = 'sock', documentName = ROOM_A): onConnectPayload {
  return { context: { userId }, documentName, socketId } as unknown as onConnectPayload;
}

// Real Hocuspocus does NOT carry the onConnect-mutated context into onDisconnect (see server.ts).
// `includeUserId` lets a test assert the realistic case where context.userId is absent on disconnect.
function disconnectPayload(
  socketId = 'sock',
  documentName = ROOM_A,
  options: { userId?: string } = {},
): onDisconnectPayload {
  const context = options.userId ? { userId: options.userId } : {};
  return { context, documentName, socketId } as unknown as onDisconnectPayload;
}

function makeExtension(
  limits: { maxConnectionsPerUser?: number; maxRoomsPerUser?: number; connectRatePerMin?: number },
  now: () => number = () => 0,
) {
  return new ConnectionLimitExtension({
    maxConnectionsPerUser: limits.maxConnectionsPerUser ?? 100,
    maxRoomsPerUser: limits.maxRoomsPerUser ?? 100,
    connectRatePerMin: limits.connectRatePerMin ?? 1000,
    logger: { warn: jest.fn(), error: jest.fn() } as never,
    now,
  });
}

// T054 / SEC1 / NFR-001: per-user connection, room, and connect-rate caps.
describe('ConnectionLimitExtension', () => {
  it('accepts connections within all limits', async () => {
    const extension = makeExtension({ maxConnectionsPerUser: 3 });
    await expect(extension.onConnect(connectPayload('u1', 's1'))).resolves.toBeUndefined();
    await expect(extension.onConnect(connectPayload('u1', 's2'))).resolves.toBeUndefined();
  });

  it('rejects (1008) when MAX_CONNECTIONS_PER_USER is exceeded', async () => {
    const extension = makeExtension({ maxConnectionsPerUser: 2 });
    await extension.onConnect(connectPayload('u1', 's1'));
    await extension.onConnect(connectPayload('u1', 's2'));
    await expect(extension.onConnect(connectPayload('u1', 's3'))).rejects.toMatchObject({ code: 1008 });
  });

  it('rejects (1008) when MAX_ROOMS_PER_USER is exceeded', async () => {
    const extension = makeExtension({ maxRoomsPerUser: 1 });
    await extension.onConnect(connectPayload('u1', 's1', ROOM_A));
    await expect(extension.onConnect(connectPayload('u1', 's2', ROOM_B))).rejects.toMatchObject({ code: 1008 });
  });

  it('rejects (1008) when CONNECT_RATE_PER_MIN is exceeded within the window', async () => {
    const extension = makeExtension({ connectRatePerMin: 2 }, () => 1000);
    await extension.onConnect(connectPayload('u1', 's1'));
    await extension.onConnect(connectPayload('u1', 's2'));
    await expect(extension.onConnect(connectPayload('u1', 's3'))).rejects.toMatchObject({ code: 1008 });
  });

  it('prunes the rate window so old attempts no longer count', async () => {
    let clock = 0;
    const extension = makeExtension({ connectRatePerMin: 1 }, () => clock);
    await extension.onConnect(connectPayload('u1', 's1'));
    clock = 61_000; // > 60s later
    await expect(extension.onConnect(connectPayload('u1', 's2'))).resolves.toBeUndefined();
  });

  it('frees a connection slot on disconnect', async () => {
    const extension = makeExtension({ maxConnectionsPerUser: 1 });
    await extension.onConnect(connectPayload('u1', 's1'));
    await extension.onDisconnect(disconnectPayload('s1'));
    await expect(extension.onConnect(connectPayload('u1', 's2'))).resolves.toBeUndefined();
  });

  // Regression: real Hocuspocus delivers onDisconnect WITHOUT the onConnect-mutated context
  // (server.ts works around the same loss for documentId). The slot must still be released —
  // keyed on the per-connection socketId — or the user is eventually permanently locked out.
  it('frees the slot on disconnect even when the disconnect context lacks userId', async () => {
    const extension = makeExtension({ maxConnectionsPerUser: 1 });
    await extension.onConnect(connectPayload('u1', 's1'));
    await extension.onDisconnect(disconnectPayload('s1')); // context = {} (no userId)
    await expect(extension.onConnect(connectPayload('u1', 's2'))).resolves.toBeUndefined();
  });

  it('does not leak room slots across repeated open/close cycles when context lacks userId', async () => {
    const extension = makeExtension({ maxRoomsPerUser: 1 });
    for (let index = 0; index < 5; index += 1) {
      await extension.onConnect(connectPayload('u1', `s${index}`, ROOM_A));
      await extension.onDisconnect(disconnectPayload(`s${index}`, ROOM_A)); // no userId in context
    }
    // After 5 clean cycles the single room slot must be free again.
    await expect(extension.onConnect(connectPayload('u1', 's-final', ROOM_B))).resolves.toBeUndefined();
  });

  it('frees a room slot when the last connection to that room disconnects', async () => {
    const extension = makeExtension({ maxRoomsPerUser: 1 });
    await extension.onConnect(connectPayload('u1', 's1', ROOM_A));
    await extension.onDisconnect(disconnectPayload('s1', ROOM_A));
    await expect(extension.onConnect(connectPayload('u1', 's2', ROOM_B))).resolves.toBeUndefined();
  });

  it('tracks limits independently per user', async () => {
    const extension = makeExtension({ maxConnectionsPerUser: 1 });
    await extension.onConnect(connectPayload('u1', 's1'));
    await expect(extension.onConnect(connectPayload('u2', 's2'))).resolves.toBeUndefined();
  });

  it('does not limit when the connection has no authenticated user id', async () => {
    const extension = makeExtension({ maxConnectionsPerUser: 1 });
    const noUser = { context: {}, documentName: ROOM_A, socketId: 's1' } as unknown as onConnectPayload;
    await expect(extension.onConnect(noUser)).resolves.toBeUndefined();
    await expect(extension.onConnect({ ...noUser, socketId: 's2' } as onConnectPayload)).resolves.toBeUndefined();
  });

  // A REJECTED connection must leave no trace: no lingering per-user state (memory leak) and no
  // rate-budget consumed by attempts that were turned away.
  it('leaves no lingering user state when a user is denied on their first connection', async () => {
    const extension = makeExtension({ maxConnectionsPerUser: 0 });
    await expect(extension.onConnect(connectPayload('u1', 's1'))).rejects.toMatchObject({ code: 1008 });
    const users = (extension as unknown as { users: Map<string, unknown> }).users;
    expect(users.has('u1')).toBe(false);
    expect(users.size).toBe(0);
  });

  it('does not count cap-denied attempts toward the connect-rate window', async () => {
    // maxConnections=1, rate=2: one accepted connect, then over-cap attempts. Those denied attempts
    // must NOT consume rate budget — after disconnecting, a fresh connect must succeed (it would be
    // wrongly rate-limited if denials counted toward the window).
    const extension = makeExtension({ maxConnectionsPerUser: 1, connectRatePerMin: 2 });
    await extension.onConnect(connectPayload('u1', 's1'));
    await expect(extension.onConnect(connectPayload('u1', 's2'))).rejects.toMatchObject({ code: 1008 });
    await expect(extension.onConnect(connectPayload('u1', 's3'))).rejects.toMatchObject({ code: 1008 });
    await extension.onDisconnect(disconnectPayload('s1'));
    await expect(extension.onConnect(connectPayload('u1', 's4'))).resolves.toBeUndefined();
  });

  // Multiple connections to the same room: disconnecting one must decrement the room count, not
  // delete the room entry — only the last disconnect for that room should free the slot.
  it('decrements the room connection count without freeing the slot when multiple connections share a room', async () => {
    const extension = makeExtension({ maxRoomsPerUser: 1 });
    await extension.onConnect(connectPayload('u1', 's1', ROOM_A));
    await extension.onConnect(connectPayload('u1', 's2', ROOM_A));
    // Disconnect one — ROOM_A still held by s2, so maxRooms=1 must still block ROOM_B
    await extension.onDisconnect(disconnectPayload('s1', ROOM_A));
    await expect(extension.onConnect(connectPayload('u1', 's3', ROOM_B))).rejects.toMatchObject({ code: 1008 });
    // Disconnect the second — now ROOM_A is fully released
    await extension.onDisconnect(disconnectPayload('s2', ROOM_A));
    await expect(extension.onConnect(connectPayload('u1', 's4', ROOM_B))).resolves.toBeUndefined();
  });

  // Feature 024: presence rooms are exempt from the per-document caps but still rate-limited.
  describe('presence rooms', () => {
    const PRESENCE = 'presence/550e8400-e29b-41d4-a716-446655440001';

    it('does not count a presence connection against the per-connection cap', async () => {
      const extension = makeExtension({ maxConnectionsPerUser: 1 });
      await extension.onConnect(connectPayload('u1', 's1', ROOM_A)); // consumes the only doc slot
      await expect(extension.onConnect(connectPayload('u1', 's2', PRESENCE))).resolves.toBeUndefined();
      await expect(extension.onConnect(connectPayload('u1', 's3', ROOM_B))).rejects.toMatchObject({ code: 1008 });
    });

    it('does not count a presence connection against the per-room cap', async () => {
      const extension = makeExtension({ maxRoomsPerUser: 1 });
      await extension.onConnect(connectPayload('u1', 's1', ROOM_A));
      await expect(extension.onConnect(connectPayload('u1', 's2', PRESENCE))).resolves.toBeUndefined();
    });

    it('still applies the connect-rate limit to presence connections', async () => {
      const extension = makeExtension({ connectRatePerMin: 1 }, () => 1000);
      await extension.onConnect(connectPayload('u1', 's1', PRESENCE));
      await expect(extension.onConnect(connectPayload('u1', 's2', PRESENCE))).rejects.toMatchObject({ code: 1008 });
    });

    it('does not count a presence disconnect against an existing document connection', async () => {
      const extension = makeExtension({ maxConnectionsPerUser: 2 });
      await extension.onConnect(connectPayload('u1', 's1', ROOM_A));
      await expect(extension.onDisconnect(disconnectPayload('s2', PRESENCE))).resolves.toBeUndefined();
      await extension.onConnect(connectPayload('u1', 's3', ROOM_A));
      await expect(extension.onConnect(connectPayload('u1', 's4', ROOM_A))).rejects.toMatchObject({ code: 1008 });
    });

    it('leaves no lingering users entry after a presence connect + disconnect', async () => {
      const extension = makeExtension({});
      await extension.onConnect(connectPayload('u1', 's1', PRESENCE));
      await extension.onDisconnect(disconnectPayload('s1', PRESENCE));
      const users = (extension as unknown as { users: Map<string, unknown> }).users;
      expect(users.has('u1')).toBe(false);
    });

    it('keeps the user entry when a presence connection closes but a document connection remains', async () => {
      const extension = makeExtension({});
      await extension.onConnect(connectPayload('u1', 'doc', ROOM_A));
      await extension.onConnect(connectPayload('u1', 'pres', PRESENCE));
      await extension.onDisconnect(disconnectPayload('pres', PRESENCE));
      const users = (extension as unknown as { users: Map<string, { connections: number }> }).users;
      expect(users.get('u1')?.connections).toBe(1);
    });
  });
});
