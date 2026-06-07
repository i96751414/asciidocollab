import type { PrismaClient } from '@prisma/client';
import {
  EditorPreferences,
  EditorPreferencesId,
  EditorTheme,
  UserId,
  Timestamps,
} from '@asciidocollab/domain';
import type { EditorPreferencesRepository } from '@asciidocollab/domain';

/** Prisma-backed implementation of EditorPreferencesRepository. */
export class PrismaEditorPreferencesRepository implements EditorPreferencesRepository {
  /** @param prisma - The Prisma client instance. */
  constructor(private readonly prisma: PrismaClient) {}

  /** @inheritdoc */
  async findByUserId(userId: UserId): Promise<EditorPreferences | null> {
    const row = await this.prisma.editorPreferences.findUnique({
      where: { userId: userId.value },
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  /** @inheritdoc */
  async save(prefs: EditorPreferences): Promise<void> {
    await this.prisma.editorPreferences.upsert({
      where: { userId: prefs.userId.value },
      update: { fontSize: prefs.fontSize, theme: prefs.theme.value, scrollSyncEnabled: prefs.scrollSyncEnabled },
      create: {
        id: prefs.id.value,
        userId: prefs.userId.value,
        fontSize: prefs.fontSize,
        theme: prefs.theme.value,
        scrollSyncEnabled: prefs.scrollSyncEnabled,
      },
    });
  }

  private toDomain(row: {
    id: string;
    userId: string;
    fontSize: number;
    theme: string;
    scrollSyncEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): EditorPreferences {
    const themeResult = EditorTheme.parse(row.theme);
    if (!themeResult.success) {
      throw new Error(`EditorPreferences row ${row.id} has unrecognised theme "${row.theme}": ${themeResult.error.message}`);
    }
    return new EditorPreferences(
      EditorPreferencesId.create(row.id),
      UserId.create(row.userId),
      row.fontSize,
      themeResult.value,
      row.scrollSyncEnabled,
      new Timestamps(row.createdAt, row.updatedAt),
    );
  }
}
