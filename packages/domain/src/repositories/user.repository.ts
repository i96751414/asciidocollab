import { User } from '../entities/user';
import { UserId } from '../value-objects/user-id';
import { Email } from '../value-objects/email';
import { ProjectId } from '../value-objects/project-id';

/**
 * Repository interface for managing User persistence.
 * Handles storage and retrieval of User entities by their identifiers.
 */
export interface UserRepository {
  /**
   * Finds a user by their unique identifier.
   * 
   * @param id - The unique identifier of the user.
   * @returns The user if found, null otherwise.
   */
  findById(id: UserId): Promise<User | null>;

  /**
   * Finds a user by their email address.
   * 
   * @param email - The email address to search for.
   * @returns The user if found, null otherwise.
   */
  findByEmail(email: Email): Promise<User | null>;

  /**
   * Persists a user entity (create or update).
   *
   * @param user - The user entity to save.
   * @returns A promise that resolves when the operation completes.
   */
  save(user: User): Promise<void>;

  /**
   * Returns true if at least one user exists in the repository.
   *
   * @returns True when any user record exists, false when the repository is empty.
   */
  hasAny(): Promise<boolean>;

  /**
   * Searches users by display name or email (case-insensitive), optionally excluding
   * members of a given project.
   *
   * @param query - The search string matched against displayName and email.
   * @param excludeProjectId - When provided, users already in this project are excluded.
   * @returns Up to 10 matching users.
   */
  search(query: string, excludeProjectId?: ProjectId): Promise<User[]>;
}
