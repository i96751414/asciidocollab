import * as shared from '../src/index';
import {
  COLLAB_INTERNAL_PORT_DEFAULT,
  PRESENCE_ROOM_PREFIX,
  presenceRoomName,
  isPresenceRoom,
} from '../src/constants';

describe('constants', () => {
  test('COLLAB_INTERNAL_PORT_DEFAULT is the default collab port', () => {
    expect(COLLAB_INTERNAL_PORT_DEFAULT).toBe(4001);
  });

  test('re-exports the constant from the package entry point', () => {
    expect(shared.COLLAB_INTERNAL_PORT_DEFAULT).toBe(COLLAB_INTERNAL_PORT_DEFAULT);
  });

  test('re-exports the project schemas from the package entry point', () => {
    expect(shared.createProjectSchema).toBeDefined();
    expect(shared.updateProjectSchema).toBeDefined();
    expect(shared.inviteMemberSchema).toBeDefined();
    expect(shared.updateMemberRoleSchema).toBeDefined();
  });

  test('presenceRoomName builds the canonical presence room name', () => {
    expect(presenceRoomName('proj-1')).toBe(`${PRESENCE_ROOM_PREFIX}proj-1`);
  });

  test('isPresenceRoom distinguishes presence rooms from document rooms', () => {
    expect(isPresenceRoom(presenceRoomName('proj-1'))).toBe(true);
    expect(isPresenceRoom('proj-1/yjs-state-1')).toBe(false);
  });
});
