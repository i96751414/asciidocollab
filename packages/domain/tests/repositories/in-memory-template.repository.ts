import { Template } from '../../src/entities/template';
import { TemplateId } from '../../src/value-objects/template-id';
import { TemplateRepository } from '../../src/repositories/template.repository';

/**
 *
 */
export class InMemoryTemplateRepository implements TemplateRepository {
  private readonly storage = new Map<string, Template>();

  /**
   *
   */
  async findById(id: TemplateId): Promise<Template | null> {
    return this.storage.get(id.value) ?? null;
  }

  /**
   *
   */
  async save(template: Template): Promise<void> {
    this.storage.set(template.id.value, template);
  }

  /**
   *
   */
  async delete(id: TemplateId): Promise<void> {
    this.storage.delete(id.value);
  }

  /**
   *
   */
  async findAll(): Promise<Template[]> {
    return [...this.storage.values()];
  }
}
