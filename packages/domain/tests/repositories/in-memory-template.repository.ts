import { Template } from '../../src/entities/template';
import { TemplateId } from '../../src/value-objects/template-id';
import { TemplateRepository } from '../../src/repositories/template.repository';

/** In-memory implementation of TemplateRepository for use in tests. */
export class InMemoryTemplateRepository implements TemplateRepository {
  private readonly storage = new Map<string, Template>();

  /** Returns the template with the given ID, or null if not found. */
  async findById(id: TemplateId): Promise<Template | null> {
    return this.storage.get(id.value) ?? null;
  }

  /** Stores a template in memory, overwriting any existing entry with the same ID. */
  async save(template: Template): Promise<void> {
    this.storage.set(template.id.value, template);
  }

  /** Removes the template with the given ID from memory. */
  async delete(id: TemplateId): Promise<void> {
    this.storage.delete(id.value);
  }

  /** Returns all stored templates. */
  async findAll(): Promise<Template[]> {
    return [...this.storage.values()];
  }
}
