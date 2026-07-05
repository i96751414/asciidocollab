import * as shared from '../src/index';
import {
  COLLAB_INTERNAL_PORT_DEFAULT,
  COLLAB_CONTENT_CHANGED_PATH,
  PRESENCE_ROOM_PREFIX,
  presenceRoomName,
  isPresenceRoom,
  parseContentRoom,
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

  test('parseContentRoom splits a document room into its two id strings', () => {
    expect(parseContentRoom('proj-1/yjs-state-1')).toEqual({ projectId: 'proj-1', yjsStateId: 'yjs-state-1' });
  });

  test('parseContentRoom returns null for a malformed room name', () => {
    expect(parseContentRoom('no-slash')).toBeNull();
    expect(parseContentRoom('/only-yjs')).toBeNull();
    expect(parseContentRoom('only-project/')).toBeNull();
  });

  test('COLLAB_CONTENT_CHANGED_PATH is the shared internal notify path', () => {
    expect(COLLAB_CONTENT_CHANGED_PATH).toBe('/internal/collab/content-changed');
  });
});
