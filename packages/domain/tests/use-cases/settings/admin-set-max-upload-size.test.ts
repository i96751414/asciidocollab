import { GetMaxUploadSizeUseCase, SetMaxUploadSizeUseCase } from '../../../src/use-cases/settings/admin-max-upload-size';
import { InMemorySystemSettingRepository } from '../../ports/admin/in-memory-system-setting.repository';
import { InMemoryUserRepository } from '../../ports/user/in-memory-user.repository';
import { InMemoryAuditLogRepository } from '../../ports/admin/in-memory-audit-log.repository';
import { User } from '../../../src/entities/user';
import { UserId } from '../../../src/value-objects/user-id';
import { Email } from '../../../src/value-objects/email';
import { Timestamps } from '../../../src/value-objects/timestamps';
import { PermissionDeniedError } from '../../../src/errors/permission-denied';
import { SETTING_MAX_UPLOAD_SIZE_BYTES } from '../../../src/constants';
import { randomUUID } from 'crypto';

const DEFAULT_MAX = 20_971_520;

function makeUser(isAdmin: boolean): User {
  return new User(
    UserId.create(randomUUID()),
    Email.create(`user-${randomUUID()}@example.com`),
    'Test User',
    'hash',
    [],
    null,
    null,
    isAdmin,
    new Timestamps(),
    true,
    'SELF_REGISTERED',
  );
}

describe('GetMaxUploadSizeUseCase', () => {
  let systemSettingRepo: InMemorySystemSettingRepository;
  let useCase: GetMaxUploadSizeUseCase;

  beforeEach(() => {
    systemSettingRepo = new InMemorySystemSettingRepository();
    useCase = new GetMaxUploadSizeUseCase(systemSettingRepo, DEFAULT_MAX);
  });

  it('returns the default when no DB entry exists', async () => {
    const result = await useCase.execute();
    expect(result.maxUploadSizeBytes).toBe(DEFAULT_MAX);
  });

  it('returns the DB value when a setting is stored', async () => {
    await systemSettingRepo.set(SETTING_MAX_UPLOAD_SIZE_BYTES, '5242880');
    const result = await useCase.execute();
    expect(result.maxUploadSizeBytes).toBe(5_242_880);
  });
});

describe('SetMaxUploadSizeUseCase', () => {
  let systemSettingRepo: InMemorySystemSettingRepository;
  let userRepo: InMemoryUserRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let useCase: SetMaxUploadSizeUseCase;
  let admin: User;
  let nonAdmin: User;

  beforeEach(async () => {
    systemSettingRepo = new InMemorySystemSettingRepository();
    userRepo = new InMemoryUserRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    useCase = new SetMaxUploadSizeUseCase(systemSettingRepo, userRepo, auditLogRepo);

    admin = makeUser(true);
    nonAdmin = makeUser(false);

    await userRepo.save(admin);
    await userRepo.save(nonAdmin);
  });

  it('admin can set maxUploadSizeBytes to a new value', async () => {
    const result = await useCase.execute(admin.id, 5_242_880);
    expect(result.success).toBe(true);
  });

  it('non-admin is rejected with PermissionDeniedError', async () => {
    const result = await useCase.execute(nonAdmin.id, 5_242_880);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });

  it('setting is persisted and readable on next call', async () => {
    await useCase.execute(admin.id, 5_242_880);
    const stored = await systemSettingRepo.get(SETTING_MAX_UPLOAD_SIZE_BYTES);
    expect(stored).toBe('5242880');

    const getUseCase = new GetMaxUploadSizeUseCase(systemSettingRepo, DEFAULT_MAX);
    const { maxUploadSizeBytes } = await getUseCase.execute();
    expect(maxUploadSizeBytes).toBe(5_242_880);
  });
});
