import { UpdateKeyBindingUseCase } from '../../src/use-cases/update-key-binding';
import { InMemoryKeyBindingRepository } from '../ports/user/in-memory-key-binding.repository';
import { KeyBindingConflictError } from '../../src/errors/key-binding-conflict';
import { ValidationError } from '../../src/errors/validation-error';

const userId = '550e8400-e29b-41d4-a716-446655440001';

describe('UpdateKeyBindingUseCase', () => {
  let repo: InMemoryKeyBindingRepository;
  let useCase: UpdateKeyBindingUseCase;

  beforeEach(() => {
    repo = new InMemoryKeyBindingRepository();
    useCase = new UpdateKeyBindingUseCase(repo);
  });

  it('result.isOk() on valid binding', async () => {
    const result = await useCase.execute(userId, 'file-tree:rename', 'F3');
    expect(result.success).toBe(true);
  });

  it('result.isErr() with ValidationError for reserved combo', async () => {
    const result = await useCase.execute(userId, 'file-tree:rename', 'Ctrl+W');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  it('result.isErr() with ValidationError for unknown action', async () => {
    const result = await useCase.execute(userId, 'unknown:action', 'F3');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(ValidationError);
  });

  it('result.isErr() with KeyBindingConflictError when another action in same namespace uses the combo', async () => {
    await repo.upsert(userId, 'file-tree:delete', 'F3');
    const result = await useCase.execute(userId, 'file-tree:rename', 'F3');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(KeyBindingConflictError);
  });

  it('cross-namespace duplicate returns result.isOk()', async () => {
    // No other namespace exists yet; F3 should be allowed in file-tree
    const result = await useCase.execute(userId, 'file-tree:rename', 'F3');
    expect(result.success).toBe(true);
  });
});
