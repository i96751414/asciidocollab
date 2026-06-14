import { saveAuditBestEffort, recordAuditSuccess } from '../../src/use-cases/audit-recording';
import { AuditLog } from '../../src/entities/audit-log';
import { AuditLogId } from '../../src/value-objects/ids/audit-log-id';
import { UserId } from '../../src/value-objects/ids/user-id';
import { ProjectId } from '../../src/value-objects/ids/project-id';
import { InMemoryAuditLogRepository } from '../ports/admin/in-memory-audit-log.repository';
import { AuditLogRepository } from '../../src/ports/admin/audit-log.repository';
import { randomUUID } from 'crypto';

function makeAuditLog(): AuditLog {
  const id = randomUUID();
  return new AuditLog(AuditLogId.create(id), UserId.create(randomUUID()), null, 'test.action', 'User', id, new Date(), {});
}

describe('saveAuditBestEffort', () => {
  it('persists the record when build + save succeed', async () => {
    const repo = new InMemoryAuditLogRepository();
    await saveAuditBestEffort(repo, () => makeAuditLog());
    expect(await repo.findAll()).toHaveLength(1);
  });

  it('swallows a SAVE failure (never throws) and logs it', async () => {
    const warn = jest.fn();
    const repo = { save: jest.fn().mockRejectedValue(new Error('db down')) } as unknown as AuditLogRepository;
    await expect(saveAuditBestEffort(repo, () => makeAuditLog(), { warn })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('swallows a CONSTRUCTION failure (never throws) and logs it — the best-effort boundary covers building the record, not just saving it', async () => {
    const warn = jest.fn();
    const save = jest.fn();
    const repo = { save } as unknown as AuditLogRepository;
    await expect(
      saveAuditBestEffort(repo, () => { throw new Error('construct fail'); }, { warn }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('recordAuditSuccess', () => {
  it('persists a governance record with the given fields and origin metadata', async () => {
    const repo = new InMemoryAuditLogRepository();
    const actorId = UserId.create(randomUUID());
    const projectId = ProjectId.create(randomUUID());

    await recordAuditSuccess(repo, {
      actorId,
      projectId,
      action: 'file.created',
      resourceType: 'FileNode',
      resourceId: 'node-1',
      metadata: { path: '/a.adoc' },
      context: { ipAddress: '203.0.113.7', userAgent: 'jest' },
    });

    const [log] = await repo.findAll();
    expect(log.userId?.value).toBe(actorId.value);
    expect(log.projectId?.value).toBe(projectId.value);
    expect(log.action).toBe('file.created');
    expect(log.resourceType).toBe('FileNode');
    expect(log.resourceId).toBe('node-1');
    expect(log.metadata).toEqual({ path: '/a.adoc', origin: { ipAddress: '203.0.113.7', userAgent: 'jest' } });
  });

  it('defaults metadata to an empty (origin-less) object when omitted', async () => {
    const repo = new InMemoryAuditLogRepository();
    await recordAuditSuccess(repo, {
      actorId: UserId.create(randomUUID()),
      projectId: null,
      action: 'auth.registered',
      resourceType: 'User',
      resourceId: 'u1',
    });
    const [log] = await repo.findAll();
    expect(log.projectId).toBeNull();
    expect(log.metadata).toEqual({});
  });

  it('is best-effort: a save failure never throws and is logged', async () => {
    const warn = jest.fn();
    const repo = { save: jest.fn().mockRejectedValue(new Error('db down')) } as unknown as AuditLogRepository;
    await expect(
      recordAuditSuccess(repo, {
        actorId: null, projectId: null, action: 'a', resourceType: 'User', resourceId: 'x',
      }, { warn }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
