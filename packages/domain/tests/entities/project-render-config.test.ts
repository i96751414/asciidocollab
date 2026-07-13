import { ProjectRenderConfig } from '../../src/entities/project-render-config';
import { ProjectRenderConfigId } from '../../src/value-objects/ids/project-render-config-id';
import { ProjectId } from '../../src/value-objects/ids/project-id';
import { Timestamps } from '../../src/value-objects/common/timestamps';
import { ValidationError } from '../../src/errors/common/validation-error';

const ID = ProjectRenderConfigId.create('22222222-2222-4222-8222-222222222222');
const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');

describe('ProjectRenderConfig entity', () => {
  it('stores a plain-object config and defaults timestamps to now', () => {
    const entity = new ProjectRenderConfig(ID, PROJECT, { doctype: 'book' });
    expect(entity.config).toEqual({ doctype: 'book' });
    expect(entity.timestamps).toBeInstanceOf(Timestamps);
  });

  it('accepts an empty config', () => {
    expect(new ProjectRenderConfig(ID, PROJECT, {}).config).toEqual({});
  });

  it('preserves supplied timestamps', () => {
    const timestamps = new Timestamps();
    expect(new ProjectRenderConfig(ID, PROJECT, {}, timestamps).timestamps).toBe(timestamps);
  });

  it('rejects a null config', () => {
    expect(() => new ProjectRenderConfig(ID, PROJECT, null as unknown as Record<string, unknown>)).toThrow(
      ValidationError,
    );
  });

  it('rejects an array config', () => {
    expect(() => new ProjectRenderConfig(ID, PROJECT, [] as unknown as Record<string, unknown>)).toThrow(
      ValidationError,
    );
  });
});
