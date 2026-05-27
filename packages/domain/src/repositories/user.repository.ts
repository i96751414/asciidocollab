import { User } from '../entities/user';
import { UserId } from '../value-objects/user-id';
import { Email } from '../value-objects/email';

/**
 * Repository interface for managing User persistence.
 * Handles storage and retrieval of User entities by their identifiers.
 */
export interface UserRepository {
  /**
   * Finds a user by their unique identifier.
   * @param id - The unique identifier of the user
   * @returns The user if found, null otherwise
   */
  findById(id: UserId): Promise<User | null>;

  /**
   * Finds a user by their email address.
   * @param email - The email address to search for
   * @returns The user if found, null otherwise
   */
  findByEmail(email: Email): Promise<User | null>;

  /**
   * Persists a user entity (create or update).
   * @param user - The user entity to save
   */
  save(user: User): Promise<void>;
}
