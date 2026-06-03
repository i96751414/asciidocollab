import { UserRepository } from '../ports/user/user.repository';

/** Returns whether the system has been set up (i.e., at least one user exists). */
export class CheckSystemSetupUseCase {
  /**
   * @param userRepo - Repository used to determine whether any users exist.
   */
  constructor(private readonly userRepo: UserRepository) {}

  /**
   * Checks whether the system is configured.
   *
   * @returns An object with `configured: true` once a user exists, `false` on a fresh install.
   */
  async execute(): Promise<{ configured: boolean }> {
    const configured = await this.userRepo.hasAny();
    return { configured };
  }
}
