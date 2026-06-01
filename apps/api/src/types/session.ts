import 'fastify';

declare module 'fastify' {
  interface Session {
    userId?: string;
    isAdmin?: boolean;
    emailVerified?: boolean;
  }
}
