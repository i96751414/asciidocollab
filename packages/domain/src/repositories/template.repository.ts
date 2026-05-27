import { Template } from '../entities/template';
import { TemplateId } from '../value-objects/template-id';

/**
 * Repository interface for managing Template persistence.
 * Handles storage and retrieval of document/project templates.
 */
export interface TemplateRepository {
  /**
   * Finds a template by its unique identifier.
   * @param id - The unique identifier of the template
   * @returns The template if found, null otherwise
   */
  findById(id: TemplateId): Promise<Template | null>;

  /**
   * Persists a template entity (create or update).
   * @param template - The template entity to save
   */
  save(template: Template): Promise<void>;

  /**
   * Removes a template by its unique identifier.
   * @param id - The unique identifier of the template to delete
   */
  delete(id: TemplateId): Promise<void>;

  /**
   * Retrieves all available templates.
   * @returns An array of all templates
   */
  findAll(): Promise<Template[]>;
}
