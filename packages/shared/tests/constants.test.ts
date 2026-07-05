import * as shared from '../src/index';
import {
  COLLAB_INTERNAL_PORT_DEFAULT,
  COLLAB_CONTENT_CHANGED_PATH,
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

  test('COLLAB_CONTENT_CHANGED_PATH is the shared internal notify path', () => {
    expect(COLLAB_CONTENT_CHANGED_PATH).toBe('/internal/collab/content-changed');
  });
});
