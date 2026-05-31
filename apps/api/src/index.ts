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
  PrismaImageRepository,
  PrismaAuditLogRepository,
  PrismaPasswordResetTokenRepository,
  PrismaEmailChangeTokenRepository,
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
} from '@asciidocollab/infrastructure';
import {
  UserRepository,
  ProjectRepository,
  FileNodeRepository,
  DocumentRepository,
  ProjectMemberRepository,
  GitRepositoryRepository,
  TemplateRepository,
  ImageRepository,
  AuditLogRepository,
  PasswordResetTokenRepository,
  EmailChangeTokenRepository,
  PasswordHasher,
  BreachChecker,
  CommonPasswordChecker,
  EmailSender,
  TokenGenerator,
  PasswordResetNotifier,
  EmailChangeNotifier,
} from '@asciidocollab/domain';
import { loadConfig, getConfig } from './config';
import { authPluginWrapped } from './plugins/auth';
import { csrfPluginWrapped } from './plugins/csrf';
import { rateLimitPluginWrapped } from './plugins/rate-limit';
import { corsPluginWrapped } from './plugins/cors';
import { httpsRedirectPluginWrapped } from './plugins/https-redirect';
import { errorHandler, notFoundHandler } from './plugins/error-handler';
import { requireAuth } from './plugins/require-auth';
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
import { setupStatusRoute } from './routes/setup-status';
import { csrfTokenRoute } from './routes/csrf-token';
import type { FastifyInstance } from 'fastify';

/** Dependency injection container for the application. */
export interface AppContainer {
  /** Prisma client instance for database access. */
  prisma: PrismaClient;
  /** Repository instances wired to domain interfaces. */
  repos: {
    user: UserRepository;
    project: ProjectRepository;
    fileNode: FileNodeRepository;
    document: DocumentRepository;
    projectMember: ProjectMemberRepository;
    gitRepository: GitRepositoryRepository;
    template: TemplateRepository;
    image: ImageRepository;
    auditLog: AuditLogRepository;
    passwordResetToken: PasswordResetTokenRepository;
    emailChangeToken: EmailChangeTokenRepository;
  };
  /** Infrastructure service instances. */
  services: {
    passwordHasher: PasswordHasher;
    breachChecker: BreachChecker;
    commonPasswordChecker: CommonPasswordChecker;
    emailSender: EmailSender;
    tokenGenerator: TokenGenerator;
    sessionEncryption: SessionEncryption;
    prismaSessionStore: PrismaSessionStore;
    passwordResetNotifier: PasswordResetNotifier;
    emailChangeNotifier: EmailChangeNotifier;
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
      image: new PrismaImageRepository(app.prisma),
      auditLog: new PrismaAuditLogRepository(app.prisma),
      passwordResetToken: new PrismaPasswordResetTokenRepository(app.prisma),
      emailChangeToken: new PrismaEmailChangeTokenRepository(app.prisma),
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
    });
  }

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(httpsRedirectPluginWrapped);
  await app.register(corsPluginWrapped);
  await app.register(authPluginWrapped);
  await app.register(rateLimitPluginWrapped);
  await app.register(csrfPluginWrapped);

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
  await app.register(csrfTokenRoute);
  await app.register(emailConfirmRoute);

  // CSRF-protected public auth routes (no session required)
  await app.register(async function csrfAuthRoutes(scopedApp: FastifyInstance) {
    scopedApp.addHook('onRequest', scopedApp.csrfProtection);
    await scopedApp.register(loginRoute);
    await scopedApp.register(registerRoute);
    await scopedApp.register(logoutRoute);
    await scopedApp.register(passwordResetRequestRoute);
    await scopedApp.register(passwordResetRoute);
  });

  // Protected routes — require authentication
  await app.register(async function protectedRoutes(scopedApp: FastifyInstance) {
    scopedApp.addHook('preHandler', requireAuth);
    await scopedApp.register(meRoute);
    await scopedApp.register(passwordChangeRoute);
    await scopedApp.register(profileUpdateRoute);
    await scopedApp.register(emailChangeRequestRoute);
    await scopedApp.register(projectRoutes);
    await scopedApp.register(memberRoutes);
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
      image: ImageRepository;
      auditLog: AuditLogRepository;
      passwordResetToken: PasswordResetTokenRepository;
      emailChangeToken: EmailChangeTokenRepository;
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
    };
  }
}
