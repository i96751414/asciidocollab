import { GetKeyBindingsUseCase } from '../../../src/use-cases/settings/get-key-bindings';
import { InMemoryKeyBindingRepository } from '../../ports/user/in-memory-key-binding.repository';

const userId = '550e8400-e29b-41d4-a716-446655440001';

describe('GetKeyBindingsUseCase', () => {
  let repo: InMemoryKeyBindingRepository;
  let useCase: GetKeyBindingsUseCase;

  beforeEach(() => {
    repo = new InMemoryKeyBindingRepository();
    useCase = new GetKeyBindingsUseCase(repo);
  });

  it('returns all actions merged with defaults when no DB rows exist', async () => {
    const result = await useCase.execute(userId);
    expect(result).toHaveLength(5);
    expect(result.every((r) => r.isDefault)).toBe(true);
  });

  it('each result includes the human-readable label from the definition', async () => {
    const result = await useCase.execute(userId);
    const findBinding = result.find((r) => r.action === 'file-tree:find');
    expect(findBinding?.label).toBe('Find File');
    const renameBinding = result.find((r) => r.action === 'file-tree:rename');
    expect(renameBinding?.label).toBe('Rename');
  });

  it('returns custom combo when DB row present', async () => {
    await repo.upsert(userId, 'file-tree:rename', 'F3');
    const result = await useCase.execute(userId);
    const binding = result.find((r) => r.action === 'file-tree:rename');
    expect(binding?.keyCombo).toBe('F3');
  });

  it('isDefault: false for customised binding', async () => {
    await repo.upsert(userId, 'file-tree:rename', 'F3');
    const result = await useCase.execute(userId);
    const binding = result.find((r) => r.action === 'file-tree:rename');
    expect(binding?.isDefault).toBe(false);
  });

  it('isDefault: true for default binding', async () => {
    const result = await useCase.execute(userId);
    const binding = result.find((r) => r.action === 'file-tree:delete');
    expect(binding?.isDefault).toBe(true);
  });

  it('optional namespace filter returns only matching actions', async () => {
    const result = await useCase.execute(userId, 'file-tree');
    expect(result.every((r) => r.action.startsWith('file-tree:'))).toBe(true);
    expect(result).toHaveLength(5);
  });
});
