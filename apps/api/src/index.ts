import Fastify from 'fastify';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaUserRepository,
  PrismaProjectRepository,
  PrismaFileNodeRepository,
  PrismaDocumentRepository,
  PrismaProjectMemberRepository,
  PrismaGitRepositoryRepository,
  PrismaTemplateRepository,
  PrismaAssetRepository,
  PrismaAuditLogRepository,
  PrismaPasswordResetTokenRepository,
  PrismaEmailChangeTokenRepository,
  PrismaUserInvitationRepository,
  PrismaEmailVerificationTokenRepository,
  PrismaSystemSettingRepository,
  PrismaSessionRepository,
  Argon2PasswordHasher,
  HIBPBreachChecker,
  CommonPasswordFileChecker,
  StubEmailSender,
  NodemailerEmailSender,
  CryptoTokenGenerator,
  SessionEncryption,
  PrismaSessionStore,
  SmtpPasswordResetNotifier,
  SmtpEmailChangeNotifier,
  SmtpRegistrationInvitationNotifier,
  SmtpEmailVerificationNotifier,
  FilesystemProjectFileStore,
  FilesystemYjsStateStore,
  PrismaKeyBindingRepository,
} from '@asciidocollab/infrastructure';
import {
  UserRepository,
  ProjectRepository,
  FileNodeRepository,
  DocumentRepository,
  ProjectMemberRepository,
  GitRepositoryRepository,
  TemplateRepository,
  AssetRepository,
  AuditLogRepository,
  PasswordResetTokenRepository,
  EmailChangeTokenRepository,
  UserInvitationRepository,
  EmailVerificationTokenRepository,
  SystemSettingRepository,
  SessionRepository,
  KeyBindingRepository,
  ProjectFileStore,
  YjsStateStore,
  PasswordHasher,
  BreachChecker,
  CommonPasswordChecker,
  EmailSender,
  TokenGenerator,
  PasswordResetNotifier,
  EmailChangeNotifier,
  RegistrationInvitationNotifier,
  EmailVerificationNotifier,
} from '@asciidocollab/domain';
import { loadConfig, getConfig } from './config';
import { authPluginWrapped } from './plugins/auth';
import { originCheckPlugin } from './plugins/origin-check';
import { rateLimitPluginWrapped } from './plugins/rate-limit';
import { corsPluginWrapped } from './plugins/cors';
import { httpsRedirectPluginWrapped } from './plugins/https-redirect';
import { errorHandler, notFoundHandler } from './plugins/error-handler';
import { requireAuth } from './plugins/require-auth';
import { requireEmailVerified } from './plugins/require-email-verified';
import { healthRoute } from './routes/health';
import { loginRoute } from './routes/login';
import { registerRoute } from './routes/register';
import { logoutRoute } from './routes/logout';
import { meRoute } from './routes/me';
import { passwordChangeRoute } from './routes/password-change';
import { profileUpdateRoute } from './routes/profile-update';
import { emailChangeRequestRoute } from './routes/email-change-request';
import { emailConfirmRoute } from './routes/email-confirm';
import { passwordResetRequestRoute } from './routes/password-reset-request';
import { passwordResetRoute } from './routes/password-reset';
import { projectRoutes } from './routes/projects';
import { memberRoutes } from './routes/projects/members';
import { usersSearchRoute } from './routes/projects/users-search';
import { setupStatusRoute } from './routes/setup-status';
import { sessionStatusRoute } from './routes/session-status';
import { acceptInviteRoute } from './routes/accept-invite';
import { usersInviteRoute } from './routes/admin/users-invite';
import { usersRoute } from './routes/admin/users';
import { usersAdminStatusRoute } from './routes/admin/users-admin-status';
import { usersRemoveRoute } from './routes/admin/users-remove';
import { verifyEmailRoute } from './routes/verify-email';
import { resendVerificationRoute } from './routes/resend-verification';
import { openRegistrationStatusRoute } from './routes/open-registration-status';
import { adminSettingsRoute } from './routes/admin/settings';
import { fileContentRoutes } from './routes/projects/file-content';
import { fileTreeRoutes } from './routes/projects/file-tree';
import { assetsRoutes } from './routes/projects/assets';
import { eventsRoutes } from './routes/projects/events';
import { fileTreeEventBusPlugin } from './plugins/file-tree-event-bus';
import { keybindingsRoutes } from './routes/users/keybindings';
import type { FastifyInstance } from 'fastify';

/** Dependency container passed to `buildServer` to wire repositories and services. */
export interface AppContainer {
  /** Prisma client instance used to construct repositories. */
  prisma: PrismaClient;
  /** Collection of domain repository implementations. */
  repos: {
    /** Repository for user persistence. */
    user: UserRepository;
    /** Repository for project persistence. */
    project: ProjectRepository;
    /** Repository for file-node persistence. */
    fileNode: FileNodeRepository;
    /** Repository for document persistence. */
    document: DocumentRepository;
    /** Repository for project-member persistence. */
    projectMember: ProjectMemberRepository;
    /** Repository for git-repository persistence. */
    gitRepository: GitRepositoryRepository;
    /** Repository for template persistence. */
    template: TemplateRepository;
    /** Repository for asset persistence. */
    asset: AssetRepository;
    /** Repository for audit-log persistence. */
    auditLog: AuditLogRepository;
    /** Repository for password-reset-token persistence. */
    passwordResetToken: PasswordResetTokenRepository;
    /** Repository for email-change-token persistence. */
    emailChangeToken: EmailChangeTokenRepository;
    /** Repository for user-invitation persistence. */
    userInvitation: UserInvitationRepository;
    /** Repository for email-verification-token persistence. */
    emailVerificationToken: EmailVerificationTokenRepository;
    /** Repository for system-setting persistence. */
    systemSetting: SystemSettingRepository;
    /** Repository for session persistence. */
    session: SessionRepository;
    /** Repository for user key bindings. */
    keyBinding: KeyBindingRepository;
  };
  /** Storage adapters for file and Yjs state persistence. */
  stores?: {
    /** Filesystem-backed store for user-visible project files. */
    fileStore: ProjectFileStore;
    /** Filesystem-backed store for Yjs collaborative state. */
    yjsStateStore: YjsStateStore;
  };
  /** Collection of domain service implementations. */
  services: {
    /** Service for hashing and verifying passwords. */
    passwordHasher: PasswordHasher;
    /** Service for checking passwords against breach databases. */
    breachChecker: BreachChecker;
    /** Service for checking passwords against a common-password list. */
    commonPasswordChecker: CommonPasswordChecker;
    /** Service for sending transactional emails. */
    emailSender: EmailSender;
    /** Service for generating cryptographic tokens. */
    tokenGenerator: TokenGenerator;
    /** Service for encrypting and decrypting session data. */
    sessionEncryption: SessionEncryption;
    /** Prisma-backed session store for use with the auth plugin. */
    prismaSessionStore: PrismaSessionStore;
    /** Notifier for password-reset emails. */
    passwordResetNotifier: PasswordResetNotifier;
    /** Notifier for email-change confirmation emails. */
    emailChangeNotifier: EmailChangeNotifier;
    /** Notifier for registration-invitation emails. */
    registrationInvitationNotifier: RegistrationInvitationNotifier;
    /** Notifier for email-verification emails. */
    emailVerificationNotifier: EmailVerificationNotifier;
  };
}

/**
 * Builds and configures the Fastify server instance.
 *
 * @param overrides - Optional dependency overrides for testing.
 * @returns A configured Fastify instance ready to listen.
 */
export async function buildServer(overrides?: Partial<AppContainer>) {
  const appConfig = getConfig();

  const app = Fastify({
    logger: {
      level: 'info',
      redact: ['req.headers.cookie', 'req.body.password', 'req.body.currentPassword', 'req.body.newPassword', 'req.body.token', 'req.body.email'],
    },
  });

  app.decorate('config', appConfig);

  if (overrides?.prisma) {
    app.decorate('prisma', overrides.prisma);
  }

  if (overrides?.repos) {
    app.decorate('repos', overrides.repos);
  } else if (app.prisma) {
    app.decorate('repos', {
      user: new PrismaUserRepository(app.prisma),
      project: new PrismaProjectRepository(app.prisma),
      fileNode: new PrismaFileNodeRepository(app.prisma),
      document: new PrismaDocumentRepository(app.prisma),
      projectMember: new PrismaProjectMemberRepository(app.prisma),
      gitRepository: new PrismaGitRepositoryRepository(app.prisma),
      template: new PrismaTemplateRepository(app.prisma),
      asset: new PrismaAssetRepository(app.prisma),
      auditLog: new PrismaAuditLogRepository(app.prisma),
      passwordResetToken: new PrismaPasswordResetTokenRepository(app.prisma),
      emailChangeToken: new PrismaEmailChangeTokenRepository(app.prisma),
      userInvitation: new PrismaUserInvitationRepository(app.prisma),
      emailVerificationToken: new PrismaEmailVerificationTokenRepository(app.prisma),
      systemSetting: new PrismaSystemSettingRepository(app.prisma),
      session: new PrismaSessionRepository(app.prisma),
      keyBinding: new PrismaKeyBindingRepository(app.prisma),
    });
  }

  if (overrides?.stores) {
    app.decorate('stores', overrides.stores);
  } else {
    const storagePath = appConfig.storage.path;
    app.decorate('stores', {
      fileStore: new FilesystemProjectFileStore(storagePath),
      yjsStateStore: new FilesystemYjsStateStore(storagePath),
    });
  }

  if (overrides?.services) {
    app.decorate('services', overrides.services);
  } else {
    const passwordHasher = new Argon2PasswordHasher({
      memoryCost: appConfig.auth.password.hashMemory,
      timeCost: appConfig.auth.password.hashTime,
      parallelism: appConfig.auth.password.hashParallelism,
    });

    const breachChecker = new HIBPBreachChecker({
      hibpApiUrl: appConfig.auth.breachCheck.hibpApiUrl,
    });

    const commonPasswordChecker = new CommonPasswordFileChecker(
      path.join(__dirname, '..', 'data', 'common-passwords.txt'),
    );

    let emailSender;
    if (appConfig.auth.email.enabled) {
      if (!appConfig.auth.email.from) {
        throw new Error('ASCIIDOCOLLAB_AUTH_EMAIL_FROM is required when email is enabled');
      }
      emailSender = new NodemailerEmailSender({
        enabled: appConfig.auth.email.enabled,
        host: appConfig.auth.email.smtpHost,
        port: appConfig.auth.email.smtpPort,
        user: appConfig.auth.email.smtpUser,
        password: appConfig.auth.email.smtpPassword,
        from: appConfig.auth.email.from,
      });
    } else {
      emailSender = new StubEmailSender();
    }

    const tokenGenerator = new CryptoTokenGenerator({
      tokenByteLength: appConfig.auth.passwordReset.tokenByteLength,
      tokenExpiry: appConfig.auth.passwordReset.tokenExpiry,
    });

    const sessionEncryption = new SessionEncryption({
      encryptionKey: appConfig.auth.session.encryptionKey,
    });

    const prismaSessionStore = app.prisma
      ? new PrismaSessionStore(app.prisma, sessionEncryption)
      : undefined;

    const passwordResetNotifier = new SmtpPasswordResetNotifier(
      emailSender,
      appConfig.auth.email.templates.resetRequest.subject,
      appConfig.auth.email.templates.resetRequest.html.replaceAll('{frontendUrl}', appConfig.api.frontendUrl),
    );

    const emailChangeNotifier = new SmtpEmailChangeNotifier(
      emailSender,
      appConfig.auth.email.templates.emailChangeRequest.subject,
      appConfig.auth.email.templates.emailChangeRequest.html.replaceAll('{frontendUrl}', appConfig.api.frontendUrl),
    );

    const registrationInvitationNotifier = new SmtpRegistrationInvitationNotifier(
      emailSender,
      appConfig.auth.invitation.subject,
      appConfig.auth.invitation.htmlTemplate.replaceAll('{frontendUrl}', appConfig.api.frontendUrl),
    );

    const emailVerificationNotifier = new SmtpEmailVerificationNotifier(
      emailSender,
      appConfig.auth.emailVerification.subject,
      appConfig.auth.emailVerification.htmlTemplate.replaceAll('{frontendUrl}', appConfig.api.frontendUrl),
      appConfig.auth.emailVerification.resendSubject,
      appConfig.auth.emailVerification.resendHtmlTemplate.replaceAll('{frontendUrl}', appConfig.api.frontendUrl),
    );

    app.decorate('services', {
      passwordHasher,
      breachChecker,
      commonPasswordChecker,
      emailSender,
      tokenGenerator,
      sessionEncryption,
      prismaSessionStore,
      passwordResetNotifier,
      emailChangeNotifier,
      registrationInvitationNotifier,
      emailVerificationNotifier,
    });
  }

  await app.register(fileTreeEventBusPlugin);

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(httpsRedirectPluginWrapped);
  await app.register(corsPluginWrapped);
  await app.register(authPluginWrapped);
  await app.register(rateLimitPluginWrapped);
  await app.register(originCheckPlugin);

  return app;
}

/**
 * Registers all application routes on a fully-built server instance.
 * Called from `start()` in production; separate to allow tests to register
 * routes individually without conflicts.
 */
export async function registerAllRoutes(app: Awaited<ReturnType<typeof buildServer>>): Promise<void> {
  // Public routes — no auth required
  await app.register(healthRoute);
  await app.register(setupStatusRoute);
  await app.register(sessionStatusRoute);
  await app.register(emailConfirmRoute);

  // Public auth routes — protected by SameSite=Strict + Origin check (replaces old CSRF tokens)
  await app.register(loginRoute);
  await app.register(registerRoute);
  await app.register(logoutRoute);
  await app.register(passwordResetRequestRoute);
  await app.register(passwordResetRoute);
  await app.register(acceptInviteRoute);
  await app.register(verifyEmailRoute);
  await app.register(openRegistrationStatusRoute);

  // Protected routes — require authentication
  await app.register(async function protectedRoutes(scopedApp: FastifyInstance) {
    scopedApp.addHook('preHandler', requireAuth);

    // Resend-verification is accessible to authenticated but UNVERIFIED users —
    // exempting it from the email-verification gate avoids a circular dependency.
    await scopedApp.register(resendVerificationRoute);

    // All remaining protected routes additionally require a verified email address.
    await scopedApp.register(async function verifiedRoutes(innerApp: FastifyInstance) {
      innerApp.addHook('preHandler', requireEmailVerified);
      await innerApp.register(meRoute);
      await innerApp.register(passwordChangeRoute);
      await innerApp.register(profileUpdateRoute);
      await innerApp.register(emailChangeRequestRoute);
      await innerApp.register(projectRoutes);
      await innerApp.register(memberRoutes);
      await innerApp.register(fileContentRoutes);
      await innerApp.register(fileTreeRoutes);
      await innerApp.register(assetsRoutes);
      await innerApp.register(eventsRoutes);
      await innerApp.register(keybindingsRoutes);
      await innerApp.register(usersSearchRoute);
      await innerApp.register(usersInviteRoute);
      await innerApp.register(usersRoute);
      await innerApp.register(usersAdminStatusRoute);
      await innerApp.register(usersRemoveRoute);
      await innerApp.register(adminSettingsRoute);
    });
  });
}

async function start() {
  const configDirectory = path.join(__dirname, '..', 'config');
  loadConfig(configDirectory);

  const appConfig = getConfig();
  const databaseUrl = process.env.ASCIIDOCOLLAB_DATABASE_URL ?? 'postgresql://localhost:5432/dev';
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  const app = await buildServer({ prisma });
  await registerAllRoutes(app);
  await app.listen({ port: appConfig.api.port, host: appConfig.api.host });
}

if (require.main === module) {
  start().catch((error) => {
    process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    config: ReturnType<typeof getConfig>;
    prisma: PrismaClient;
    repos: {
      user: UserRepository;
      project: ProjectRepository;
      fileNode: FileNodeRepository;
      document: DocumentRepository;
      projectMember: ProjectMemberRepository;
      gitRepository: GitRepositoryRepository;
      template: TemplateRepository;
      asset: AssetRepository;
      auditLog: AuditLogRepository;
      passwordResetToken: PasswordResetTokenRepository;
      emailChangeToken: EmailChangeTokenRepository;
      userInvitation: UserInvitationRepository;
      emailVerificationToken: EmailVerificationTokenRepository;
      systemSetting: SystemSettingRepository;
      session: SessionRepository;
      keyBinding: KeyBindingRepository;
    };
    stores: {
      fileStore: ProjectFileStore;
      yjsStateStore: YjsStateStore;
    };
    services: {
      passwordHasher: PasswordHasher;
      breachChecker: BreachChecker;
      commonPasswordChecker: CommonPasswordChecker;
      emailSender: EmailSender;
      tokenGenerator: TokenGenerator;
      sessionEncryption: SessionEncryption;
      prismaSessionStore: PrismaSessionStore | undefined;
      passwordResetNotifier: PasswordResetNotifier;
      emailChangeNotifier: EmailChangeNotifier;
      registrationInvitationNotifier: RegistrationInvitationNotifier;
      emailVerificationNotifier: EmailVerificationNotifier;
    };
  }
}
