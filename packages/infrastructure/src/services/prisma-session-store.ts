import type { PrismaClient } from '@prisma/client';
import type { SessionStore } from '@fastify/session';
import { SessionEncryption } from './session-encryption';

/**
 * Prisma-backed session store for the fastify session plugin.
 *
 * Encrypts session data using AES-256-GCM before storing in the database.
 */
export class PrismaSessionStore implements SessionStore {
  /**
   * @param prisma - The Prisma client instance.
   * @param encryption - The session encryption service.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: SessionEncryption,
  ) {}

  /**
   * Stores a session in the database.
   *
   * @param sessionId - The session identifier.
   * @param session - The session data to store.
   * @param callback - Callback to invoke when done.
   */
  async set(sessionId: string, session: { cookie?: { expires?: Date | null }; userId?: string }, callback: (error?: unknown) => void): Promise<void> {
    try {
      const userId = session.userId;
      const expiresAt = session.cookie?.expires ?? new Date(Date.now() + 86_400_000);

      const rawData = JSON.stringify(session);
      const encryptedData = this.encryption.encrypt(rawData);

      const data = {
        sid: sessionId,
        userId: userId || null,
        data: encryptedData,
        expiresAt,
      };

      await this.prisma.session.upsert({
        where: { sid: sessionId },
        create: data,
        update: data,
      });
      callback();
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Retrieves a session from the database.
   *
   * @param sessionId - The session identifier.
   * @param callback - Callback to invoke with the session data.
   */
  async get(sessionId: string, callback: (error: unknown, result?: import('fastify').Session | null) => void): Promise<void> {
    try {
      const record = await this.prisma.session.findUnique({ where: { sid: sessionId } });
      if (!record) {
        callback(null, null);
        return;
      }
      if (record.expiresAt < new Date()) {
        await this.prisma.session.delete({ where: { sid: sessionId } }).catch(() => {});
        callback(null, null);
        return;
      }
      const rawData = typeof record.data === 'string' ? record.data : JSON.stringify(record.data);
      const decryptedData = this.encryption.decrypt(rawData);
      const session: import('fastify').Session = JSON.parse(decryptedData);
      callback(null, session);
    } catch (error) {
      callback(error, null);
    }
  }

  /**
   * Destroys a session in the database.
   *
   * @param sessionId - The session identifier to destroy.
   * @param callback - Callback to invoke when done.
   */
  async destroy(sessionId: string, callback: (error?: unknown) => void): Promise<void> {
    try {
      await this.prisma.session.deleteMany({ where: { sid: sessionId } });
      callback();
    } catch (error) {
      callback(error);
    }
  }
}
