/** @file Barrel re-exports for domain services (interfaces + pure domain-service modules). */
// Pure AsciiDoc analysis domain service — reference/symbol extraction + include-graph (stateless).
export {
  headingToId,
  parseIncludeLevelOffset,
  extractReferences,
  extractSymbols,
  extractAttributeDefinitions,
  resolveReference,
  buildIncludeGraph,
  inheritedLevelOffset,
} from './asciidoc-extraction';
// Centralized include/image target resolution (attribute substitution + imagesdir + sandbox).
export {
  substitutePathAttributes,
  imagesDirectory,
  resolveIncludeTarget,
  resolveImageTarget,
} from './asciidoc-path';
export { PasswordHasher } from './password-hasher';
export { BreachChecker } from './breach-checker';
export { EmailSender } from './email-sender';
export { TokenGenerator, PasswordResetTokenData } from './token-generator';
export { CommonPasswordChecker } from './common-password-checker';
export { PasswordResetNotifier } from './password-reset-notifier';
export { EmailChangeNotifier } from './email-change-notifier';
export { RegistrationInvitationNotifier } from './registration-invitation-notifier';
export { EmailVerificationNotifier } from './email-verification-notifier';
