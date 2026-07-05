import * as shared from '../src/index';
import {
  PRESENCE_ROOM_PREFIX,
  presenceRoomName,
  isPresenceRoom,
  parseContentRoom,
} from '../src/room-names';

describe('room-names', () => {
  test('presenceRoomName builds the canonical presence room name', () => {
    expect(presenceRoomName('proj-1')).toBe(`${PRESENCE_ROOM_PREFIX}proj-1`);
  });

  test('isPresenceRoom distinguishes presence rooms from document rooms', () => {
    expect(isPresenceRoom(presenceRoomName('proj-1'))).toBe(true);
    expect(isPresenceRoom('proj-1/yjs-state-1')).toBe(false);
  });

  test('parseContentRoom splits a document room into its two id strings', () => {
    expect(parseContentRoom('proj-1/yjs-state-1')).toEqual({ projectId: 'proj-1', yjsStateId: 'yjs-state-1' });
  });

  test('parseContentRoom returns null for a malformed room name', () => {
    expect(parseContentRoom('no-slash')).toBeNull();
    expect(parseContentRoom('/only-yjs')).toBeNull();
    expect(parseContentRoom('only-project/')).toBeNull();
  });

  test('re-exports the room-name helpers from the package entry point', () => {
    expect(shared.presenceRoomName).toBe(presenceRoomName);
    expect(shared.isPresenceRoom).toBe(isPresenceRoom);
    expect(shared.parseContentRoom).toBe(parseContentRoom);
    expect(shared.PRESENCE_ROOM_PREFIX).toBe(PRESENCE_ROOM_PREFIX);
  });
});
