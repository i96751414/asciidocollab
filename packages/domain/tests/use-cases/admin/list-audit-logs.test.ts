import { ListAuditLogsUseCase } from '../../../src/use-cases/admin/list-audit-logs';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { InMemoryUserRepository } from '../../ports/user/in-memory-user.repository';
import { AuditLog } from '../../../src/entities/audit-log';
import { AuditLogId } from '../../../src/value-objects/audit-log-id';
import { User } from '../../../src/entities/user';
import { UserId } from '../../../src/value-objects/user-id';
import { Email } from '../../../src/value-objects/email';
import { Timestamps } from '../../../src/value-objects/timestamps';

function makeAdminUser(id: string): User {
  return new User(
    UserId.create(id),
    Email.create('admin@example.com'),
    'Admin',
    'hash',
    [],
    null,
    null,
    true,
    new Timestamps(),
    true,
    'SELF_REGISTERED',
    null,
    'system',
  );
}

function makeRegularUser(id: string): User {
  return new User(
    UserId.create(id),
    Email.create('user@example.com'),
    'User',
    'hash',
    [],
    null,
    null,
    false,
    new Timestamps(),
    true,
    'SELF_REGISTERED',
    null,
    'system',
  );
}

let _logCounter = 0;
function makeLog(_id: string, action: string, userId: string, timestamp?: Date): AuditLog {
  const uuid = `550e8400-e29b-41d4-a716-${String(++_logCounter).padStart(12, '0')}`;
  return new AuditLog(
    AuditLogId.create(uuid),
    UserId.create(userId),
    null,
    action,
    'PAGE',
    '/test',
    timestamp ?? new Date(),
  );
}

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('ListAuditLogsUseCase', () => {
  let auditLogRepo: InMemoryAuditLogRepository;
  let userRepo: InMemoryUserRepository;
  let useCase: ListAuditLogsUseCase;
  const actorId = UserId.create(ADMIN_ID);

  beforeEach(async () => {
    auditLogRepo = new InMemoryAuditLogRepository();
    userRepo = new InMemoryUserRepository();
    await userRepo.save(makeAdminUser(ADMIN_ID));
    await userRepo.save(makeRegularUser(USER_ID));
    useCase = new ListAuditLogsUseCase(auditLogRepo, userRepo);
  });

  test('returns PermissionDeniedError for non-admin actor', async () => {
    const nonAdminId = UserId.create(USER_ID);
    const result = await useCase.execute(nonAdminId, {}, { page: 1, limit: 50 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/permission/i);
    }
  });

  test('returns paged result for admin actor', async () => {
    await auditLogRepo.save(makeLog('log-1111-1111-1111-111111111111', 'ACTION_A', ADMIN_ID));
    const result = await useCase.execute(actorId, {}, { page: 1, limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.total).toBe(1);
      expect(result.value.page).toBe(1);
    }
  });

  test('applies default limit of 50 when no limit given', async () => {
    for (let index = 0; index < 60; index++) {
      await auditLogRepo.save(makeLog(`log${index}-111-1111-1111-111111111111`.slice(0, 36), 'ACTION', ADMIN_ID));
    }
    const result = await useCase.execute(actorId, {}, { page: 1, limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.items.length).toBe(50);
      expect(result.value.total).toBe(60);
    }
  });

  test('caps limit at 200 even if higher is requested', async () => {
    const result = await useCase.execute(actorId, {}, { page: 1, limit: 500 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.items.length).toBeLessThanOrEqual(200);
    }
  });

  test('filters by actionType', async () => {
    await auditLogRepo.save(makeLog('log-1111-1111-1111-111111111111', 'ACTION_A', ADMIN_ID));
    await auditLogRepo.save(makeLog('log-2222-2222-2222-222222222222', 'ACTION_B', ADMIN_ID));
    const result = await useCase.execute(actorId, { actionType: 'ACTION_A' }, { page: 1, limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0].action).toBe('ACTION_A');
    }
  });
});
