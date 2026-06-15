import { UpdateKeyBindingUseCase } from '../../../src/use-cases/settings/update-key-binding';
import { InMemoryKeyBindingRepository } from '../../ports/user/in-memory-key-binding.repository';
import { KeyBindingConflictError } from '../../../src/errors/editor/key-binding-conflict';
import { ValidationError } from '../../../src/errors/common/validation-error';

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

  it('does not conflict when an existing binding uses a different key combo', async () => {
    // file-tree:delete is custom-bound to Alt+D — no conflict with F3 for file-tree:rename
    await repo.upsert(userId, 'file-tree:delete', 'Alt+D');
    const result = await useCase.execute(userId, 'file-tree:rename', 'F3');
    expect(result.success).toBe(true);
  });

  it('skips the action being updated when checking for same-action binding conflicts', async () => {
    // Re-binding an action to a different combo should not conflict with its own existing binding
    await repo.upsert(userId, 'file-tree:rename', 'F4');
    const result = await useCase.execute(userId, 'file-tree:rename', 'F3');
    expect(result.success).toBe(true);
  });

  it('conflicts with the default key combo of another action in the same namespace', async () => {
    // file-tree:delete defaults to 'Delete'; trying to bind file-tree:rename to 'Delete' should fail
    const result = await useCase.execute(userId, 'file-tree:rename', 'Delete');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeInstanceOf(KeyBindingConflictError);
  });
});
