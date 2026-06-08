import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaCollaborationSessionRepository,
  FilesystemYjsStateStore,
  FilesystemProjectFileStore,
  PrismaSystemSettingRepository,
  PrismaDocumentRepository,
  PrismaFileNodeRepository,
} from '@asciidocollab/infrastructure';
import { OpenCollaborationSessionUseCase, CloseCollaborationSessionUseCase } from '@asciidocollab/domain';
import { PersistenceExtension } from './extensions/persistence';
import { AuthHookExtension } from './extensions/auth-hook';
import { createCollabServer } from './server';
import { createCollabConfig } from './config/collab-config';
import pino from 'pino';

/** Wires up all dependencies and returns the configured server and its supporting objects. */
export async function compositionRoot() {
  const config = createCollabConfig();
  config.validate({ allowed: 'strict' });

  const prisma = new PrismaClient({ adapter: new PrismaPg(config.get('databaseUrl')) });

  const storagePath = config.get('storagePath');

  const collaborationSessionRepo = new PrismaCollaborationSessionRepository(prisma);
  const yjsStateStore = new FilesystemYjsStateStore(storagePath);
  const projectFileStore = new FilesystemProjectFileStore(storagePath);
  const systemSettingRepo = new PrismaSystemSettingRepository(prisma);
  const documentRepository = new PrismaDocumentRepository(prisma);
  const fileNodeRepository = new PrismaFileNodeRepository(prisma);

  const openCollaborationSessionUseCase = new OpenCollaborationSessionUseCase();
  const closeCollaborationSessionUseCase = new CloseCollaborationSessionUseCase();

  const logger = pino({ redact: ['req.headers.cookie', 'req.headers.Cookie'] });

  const authHookExtension = new AuthHookExtension({
    apiInternalUrl: config.get('apiInternalUrl'),
    authTimeoutMs: config.get('authTimeoutMs'),
    logger,
  });

  const persistenceExtension = new PersistenceExtension(
    yjsStateStore,
    projectFileStore,
    documentRepository,
    fileNodeRepository,
  );

  const server = await createCollabServer(
    { port: config.get('port') },
    [authHookExtension, persistenceExtension],
    systemSettingRepo,
    {
      onRoomOpen: (projectId, documentId) =>
        openCollaborationSessionUseCase.execute(projectId, documentId, collaborationSessionRepo),
      onRoomClose: (projectId, documentId) =>
        closeCollaborationSessionUseCase.execute(projectId, documentId, collaborationSessionRepo),
    },
    documentRepository,
  );

  return {
    server,
    prisma,
    collaborationSessionRepo,
    documentRepository,
    openCollaborationSessionUseCase,
    closeCollaborationSessionUseCase,
    config,
  };
}
