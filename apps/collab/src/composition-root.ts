import { readFileSync } from 'node:fs';
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
import { PersistenceExtension } from './extensions/persistence.js';
import { AuthHookExtension } from './extensions/auth-hook.js';
import { ConnectionLimitExtension } from './extensions/connection-limit.js';
import { createMtlsFetch } from './extensions/mtls-fetch.js';
import { createCollabServer } from './server.js';
import { createCollabConfig } from './config/collab-config.js';
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

  const tlsCert = config.get('apiInternalTls.cert');
  const tlsKey = config.get('apiInternalTls.key');
  const tlsCa = config.get('apiInternalTls.ca');
  const mtlsFetch = tlsCert && tlsKey && tlsCa
    ? createMtlsFetch(readFileSync(tlsCert), readFileSync(tlsKey), readFileSync(tlsCa))
    : undefined;

  const allowedOrigins = config
    .get('allowedOrigins')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const authHookExtension = new AuthHookExtension({
    apiInternalUrl: config.get('apiInternalUrl'),
    authTimeoutMs: config.get('authTimeoutMs'),
    logger,
    allowedOrigins,
    ...(mtlsFetch && { fetch: mtlsFetch }),
  });

  // Runs after the auth hook (which sets context.userId) and before persistence.
  const connectionLimitExtension = new ConnectionLimitExtension({
    maxConnectionsPerUser: config.get('maxConnectionsPerUser'),
    maxRoomsPerUser: config.get('maxRoomsPerUser'),
    connectRatePerMin: config.get('connectRatePerMin'),
    logger,
  });

  const persistenceExtension = new PersistenceExtension(
    yjsStateStore,
    projectFileStore,
    documentRepository,
    fileNodeRepository,
  );

  const server = await createCollabServer(
    { port: config.get('port'), maxPayloadBytes: config.get('maxPayloadBytes'), logger },
    [authHookExtension, connectionLimitExtension, persistenceExtension],
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
    // Exposed so the internal edit server's read endpoint can decode a dormant room's persisted state.
    yjsStateStore,
    openCollaborationSessionUseCase,
    closeCollaborationSessionUseCase,
    config,
    // Exposed so startup can verify shared storage with the API over the same (optionally mTLS) channel.
    mtlsFetch,
  };
}
