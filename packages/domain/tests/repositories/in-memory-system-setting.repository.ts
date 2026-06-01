import { SystemSettingRepository } from '../../src/repositories/system-setting.repository';

export class InMemorySystemSettingRepository implements SystemSettingRepository {
  private readonly storage = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.storage.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }
}
