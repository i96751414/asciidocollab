import { GetProjectRenderConfigUseCase } from '../../../src/use-cases/settings/get-project-render-config';
import { SaveProjectRenderConfigUseCase } from '../../../src/use-cases/settings/save-project-render-config';
import { InMemoryProjectRenderConfigRepository } from '../../ports/project/in-memory-project-render-config.repository';
import { InMemoryProjectMemberRepository } from '../../ports/project/in-memory-project-member.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { ProjectMember } from '../../../src/entities/project-member';
import { Role } from '../../../src/value-objects/identity/role';
import { ProjectId } from '../../../src/value-objects/ids/project-id';
import { UserId } from '../../../src/value-objects/ids/user-id';
import { PermissionDeniedError } from '../../../src/errors/common/permission-denied';
import { ValidationError } from '../../../src/errors/common/validation-error';
import { AUDIT_PROJECT_RENDER_CONFIG_UPDATED } from '../../../src/audit-actions';

const PROJECT = ProjectId.create('11111111-1111-4111-8111-111111111111');
const OWNER = UserId.create('44444444-4444-4444-8444-444444444444');
const EDITOR = UserId.create('55555555-5555-4555-8555-555555555555');
const VIEWER = UserId.create('66666666-6666-4666-8666-666666666666');
const OUTSIDER = UserId.create('77777777-7777-4777-8777-777777777777');

describe('Project render-config use cases', () => {
  let repo: InMemoryProjectRenderConfigRepository;
  let memberRepo: InMemoryProjectMemberRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let save: SaveProjectRenderConfigUseCase;
  let get: GetProjectRenderConfigUseCase;

  beforeEach(async () => {
    repo = new InMemoryProjectRenderConfigRepository();
    memberRepo = new InMemoryProjectMemberRepository();
    auditRepo = new InMemoryAuditLogRepository();
    await memberRepo.addMember(new ProjectMember(PROJECT, OWNER, Role.create('owner'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, EDITOR, Role.create('editor'), new Date()));
    await memberRepo.addMember(new ProjectMember(PROJECT, VIEWER, Role.create('viewer'), new Date()));
    save = new SaveProjectRenderConfigUseCase(repo, memberRepo, auditRepo);
    get = new GetProjectRenderConfigUseCase(repo, memberRepo);
  });

  describe('save', () => {
    it('persists the config for an editor and audits the change', async () => {
      const result = await save.execute(EDITOR, PROJECT, { doctype: 'book', toc: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.config).toEqual({ doctype: 'book', toc: true });
      }
      const stored = await repo.findByProjectId(PROJECT);
      expect(stored?.config).toEqual({ doctype: 'book', toc: true });
      const audits = await auditRepo.findByProjectId(PROJECT);
      expect(audits.some((entry) => entry.action === AUDIT_PROJECT_RENDER_CONFIG_UPDATED)).toBe(true);
    });

    it('allows an owner to save', async () => {
      const result = await save.execute(OWNER, PROJECT, {});
      expect(result.success).toBe(true);
    });

    it('updates in place, reusing the record id and preserving created timestamp', async () => {
      const first = await save.execute(EDITOR, PROJECT, { media: 'print' });
      const second = await save.execute(EDITOR, PROJECT, { media: 'prepress' });
      expect(first.success && second.success).toBe(true);
      if (first.success && second.success) {
        expect(second.value.id.value).toBe(first.value.id.value);
        expect(second.value.timestamps.createdAt).toEqual(first.value.timestamps.createdAt);
        expect(second.value.config).toEqual({ media: 'prepress' });
      }
    });

    it('denies a viewer and records an authz denial', async () => {
      const result = await save.execute(VIEWER, PROJECT, { doctype: 'book' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PermissionDeniedError);
      }
      expect(await repo.findByProjectId(PROJECT)).toBeNull();
      const audits = await auditRepo.findAll();
      expect(audits.length).toBeGreaterThan(0);
    });

    it('denies a non-member', async () => {
      const result = await save.execute(OUTSIDER, PROJECT, {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PermissionDeniedError);
      }
    });

    it('returns a validation error when the config is not a plain object', async () => {
      const result = await save.execute(EDITOR, PROJECT, [] as unknown as Record<string, unknown>);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError);
      }
      expect(await repo.findByProjectId(PROJECT)).toBeNull();
    });

    it('propagates an unexpected repository error', async () => {
      const boom = new Error('db down');
      const throwingRepo = {
        findByProjectId: async (): Promise<never> => {
          throw boom;
        },
        save: async (): Promise<void> => undefined,
      };
      const useCase = new SaveProjectRenderConfigUseCase(throwingRepo, memberRepo, auditRepo);
      await expect(useCase.execute(EDITOR, PROJECT, {})).rejects.toBe(boom);
    });
  });

  describe('get', () => {
    it('returns null when nothing is saved', async () => {
      const result = await get.execute(VIEWER, PROJECT);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeNull();
      }
    });

    it('returns the saved config for any member', async () => {
      await save.execute(EDITOR, PROJECT, { lang: 'en' });
      const result = await get.execute(VIEWER, PROJECT);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value?.config).toEqual({ lang: 'en' });
      }
    });

    it('denies a non-member', async () => {
      const result = await get.execute(OUTSIDER, PROJECT);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PermissionDeniedError);
      }
    });
  });
});
