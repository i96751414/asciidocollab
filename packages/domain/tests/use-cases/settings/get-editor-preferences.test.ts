import { GetEditorPreferencesUseCase } from '../../../src/use-cases/settings/get-editor-preferences';
import { InMemoryEditorPreferencesRepository } from '../../ports/user/in-memory-editor-preferences.repository';
import { UserId } from '../../../src/value-objects/user-id';
import { EditorPreferencesId } from '../../../src/value-objects/editor-preferences-id';
import { EditorPreferences } from '../../../src/entities/editor-preferences';
import { EditorTheme } from '../../../src/value-objects/editor-theme';
import { DEFAULT_FONT_SIZE, DEFAULT_THEME } from '../../../src/constants/editor-preferences';

const userId = UserId.create('550e8400-e29b-41d4-a716-446655440000');

function makeTheme(v: string) {
  const result = EditorTheme.parse(v);
  if (!result.success) throw result.error;
  return result.value;
}

describe('GetEditorPreferencesUseCase', () => {
  test('returns existing record when found', async () => {
    const repo = new InMemoryEditorPreferencesRepository();
    const id = EditorPreferencesId.create('660e8400-e29b-41d4-a716-446655440001');
    const existing = new EditorPreferences(id, userId, 16, makeTheme('high-contrast'));
    await repo.save(existing);

    const useCase = new GetEditorPreferencesUseCase(repo);
    const result = await useCase.execute(userId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.fontSize).toBe(16);
      expect(result.value.theme.value).toBe('high-contrast');
    }
  });

  test('returns default preferences when no record found', async () => {
    const repo = new InMemoryEditorPreferencesRepository();
    const useCase = new GetEditorPreferencesUseCase(repo);
    const result = await useCase.execute(userId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.fontSize).toBe(DEFAULT_FONT_SIZE);
      expect(result.value.theme.value).toBe(DEFAULT_THEME);
    }
  });

  test('never returns an error', async () => {
    const repo = new InMemoryEditorPreferencesRepository();
    const useCase = new GetEditorPreferencesUseCase(repo);
    const result = await useCase.execute(userId);
    expect(result.success).toBe(true);
  });
});
