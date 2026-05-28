import type { PrismaClient } from '@prisma/client';
import type { SessionStore } from '@fastify/session';
import { encrypt, decrypt } from './session-encryption';

/**
 * Prisma-backed session store for \@fastify/session.
 * Encrypts session data using AES-256-GCM before storing.
 */
export class PrismaSessionStore implements SessionStore {
  /**
   * @param prisma - The Prisma client instance.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Stores a session in the database.
   *
   * @param sessionId - The session identifier.
   * @param session - The session data to store.
   * @param callback - Callback to invoke when done.
   */
  async set(sessionId: string, session: { cookie?: { expires?: Date | null }; userId?: string }, callback: (err?: unknown) => void): Promise<void> {
    try {
      const userId = session.userId;
      const expiresAt = session.cookie?.expires ?? new Date(Date.now() + 86400000);

      const rawData = JSON.stringify(session);
      const encryptedData = encrypt(rawData);

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
  async get(sessionId: string, callback: (err: unknown, result?: import('fastify').Session | null) => void): Promise<void> {
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
      const decryptedData = decrypt(rawData);
      const session = JSON.parse(decryptedData) as import('fastify').Session;
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
  async destroy(sessionId: string, callback: (err?: unknown) => void): Promise<void> {
    try {
      await this.prisma.session.deleteMany({ where: { sid: sessionId } });
      callback();
    } catch (error) {
      callback(error);
    }
  }
}
