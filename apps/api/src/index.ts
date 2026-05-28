import Fastify from 'fastify';
import path from 'path';
import { PrismaClient } from '@prisma/client';
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
} from '@asciidocollab/domain';
import { loadConfig, getConfig } from './config';
import { authPluginWrapped } from './plugins/auth';
import { rateLimitPluginWrapped } from './plugins/rate-limit';
import { corsPluginWrapped } from './plugins/cors';
import { httpsRedirectPluginWrapped } from './plugins/https-redirect';
import { errorHandler, notFoundHandler } from './plugins/error-handler';
import { healthRoute } from './routes/health';

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
    });
  }

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(httpsRedirectPluginWrapped);
  await app.register(corsPluginWrapped);
  await app.register(authPluginWrapped);
  await app.register(rateLimitPluginWrapped);

  await app.register(healthRoute);

  return app;
}

async function start() {
  const configDirectory = path.join(__dirname, '..', 'config');
  loadConfig(configDirectory);

  const appConfig = getConfig();
  const prisma = new PrismaClient();
  const app = await buildServer({ prisma });
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
    };
  }
}
