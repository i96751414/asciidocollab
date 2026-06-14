import Fastify from 'fastify';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type {
  SessionEncryption,
  PrismaSessionStore,
} from '@asciidocollab/infrastructure';
import type {
  UserRepository,
  ProjectRepository,
  FileNodeRepository,
  DocumentRepository,
  ProjectMemberRepository,
  GitRepositoryRepository,
  TemplateRepository,
  AssetRepository,
  AuditLogRepository,
  AuthAttemptTelemetryRepository,
  PasswordResetTokenRepository,
  EmailChangeTokenRepository,
  UserInvitationRepository,
  EmailVerificationTokenRepository,
  SystemSettingRepository,
  SessionRepository,
  KeyBindingRepository,
  EditorPreferencesRepository,
  CollaborationSessionRepository,
  ProjectFileStore,
  YjsStateStore,
  CollaborativeContentEditor,
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
import { createRepositories } from './di/repositories';
import { createStores } from './di/stores';
import { createServices } from './di/services';
import { registerPlugins } from './di/plugins';
import { registerRoutes } from './di/routes';
import { createInternalServer } from './internal-server';

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
    /** Repository for failed sign-in telemetry persistence. */
    authAttemptTelemetry: AuthAttemptTelemetryRepository;
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
    /** Repository for editor preferences. */
    editorPreferences: EditorPreferencesRepository;
    /** Repository for active collaboration sessions. */
    collaborationSession: CollaborationSessionRepository;
  };
  /** Storage adapters for file and Yjs state persistence. */
  stores?: {
    /** Filesystem-backed store for user-visible project files. */
    fileStore: ProjectFileStore;
    /** Filesystem-backed store for Yjs collaborative state. */
    yjsStateStore: YjsStateStore;
    /** Applies content edits to live collaborative documents via the collab server (Yjs source of truth). */
    collaborativeContentEditor: CollaborativeContentEditor;
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
    /** Prisma-backed session store for use with the auth plugin. Undefined if SESSION_SECRET is not set. */
    prismaSessionStore: PrismaSessionStore | undefined;
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
    app.decorate('repos', createRepositories(app.prisma));
  }

  if (overrides?.stores) {
    app.decorate('stores', overrides.stores);
  } else {
    app.decorate('stores', createStores(appConfig));
  }

  if (overrides?.services) {
    app.decorate('services', overrides.services);
  } else {
    app.decorate(
      'services',
      createServices({
        appConfig,
        prisma: app.prisma,
        commonPasswordsPath: path.join(__dirname, '..', 'data', 'common-passwords.txt'),
      }),
    );
  }

  await registerPlugins(app);

  return app;
}

/**
 * Registers all application routes on a fully-built server instance.
 * Called from `start()` in production; separate to allow tests to register
 * routes individually without conflicts.
 */
export async function registerAllRoutes(app: Awaited<ReturnType<typeof buildServer>>): Promise<void> {
  await registerRoutes(app);
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

  const internalServer = await createInternalServer({
    prisma,
    repos: app.repos,
    services: app.services,
    config: appConfig,
  });

  await internalServer.listen({
    port: appConfig.collab.internalPort,
    host: appConfig.collab.internalHost,
  });

  const shutdown = async () => {
    await internalServer.close();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
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
      authAttemptTelemetry: AuthAttemptTelemetryRepository;
      passwordResetToken: PasswordResetTokenRepository;
      emailChangeToken: EmailChangeTokenRepository;
      userInvitation: UserInvitationRepository;
      emailVerificationToken: EmailVerificationTokenRepository;
      systemSetting: SystemSettingRepository;
      session: SessionRepository;
      keyBinding: KeyBindingRepository;
      editorPreferences: EditorPreferencesRepository;
      collaborationSession: CollaborationSessionRepository;
    };
    stores: {
      fileStore: ProjectFileStore;
      yjsStateStore: YjsStateStore;
      collaborativeContentEditor: CollaborativeContentEditor;
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
