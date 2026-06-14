import { ResetKeyBindingUseCase } from '../../../src/use-cases/settings/reset-key-binding';
import { GetKeyBindingsUseCase } from '../../../src/use-cases/settings/get-key-bindings';
import { InMemoryKeyBindingRepository } from '../../ports/user/in-memory-key-binding.repository';
import { ValidationError } from '../../../src/errors/common/validation-error';

const userId = '550e8400-e29b-41d4-a716-446655440001';

describe('ResetKeyBindingUseCase', () => {
  let repo: InMemoryKeyBindingRepository;
  let useCase: ResetKeyBindingUseCase;

  beforeEach(() => {
    repo = new InMemoryKeyBindingRepository();
    useCase = new ResetKeyBindingUseCase(repo);
  });

  it('result.isOk() on valid action', async () => {
    await repo.upsert(userId, 'file-tree:rename', 'F3');
    const result = await useCase.execute(userId, 'file-tree:rename');
    expect(result.success).toBe(true);
  });

  it('deletes DB row so subsequent GetKeyBindingsUseCase returns default', async () => {
    await repo.upsert(userId, 'file-tree:rename', 'F3');
    await useCase.execute(userId, 'file-tree:rename');

    const getUseCase = new GetKeyBindingsUseCase(repo);
    const bindings = await getUseCase.execute(userId);
    const binding = bindings.find((b) => b.action === 'file-tree:rename');
    expect(binding?.keyCombo).toBe('F2');
    expect(binding?.isDefault).toBe(true);
  });

  it('result.isErr() with ValidationError for unknown action', async () => {
    const result = await useCase.execute(userId, 'unknown:action');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });
});
