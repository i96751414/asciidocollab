import fastifyEnv from '@fastify/env';
import type { FastifyInstance } from 'fastify';

const schema = {
  type: 'object',
  required: [
    'ASCIIDOCOLLAB_AUTH_SESSION_SECRET',
    'ASCIIDOCOLLAB_AUTH_EMAIL_FROM',
    'ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY',
  ],
  properties: {
    ASCIIDOCOLLAB_API_PORT: {
      type: 'integer',
      default: 4000,
    },
    ASCIIDOCOLLAB_API_HOST: {
      type: 'string',
      default: '0.0.0.0',
    },
    ASCIIDOCOLLAB_API_TRUST_PROXY: {
      type: 'boolean',
      default: false,
    },
    ASCIIDOCOLLAB_API_CORS_ORIGINS: {
      type: 'string',
      default: '',
    },
    ASCIIDOCOLLAB_AUTH_SESSION_SECRET: {
      type: 'string',
    },
    ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE: {
      type: 'integer',
      default: 1800000,
    },
    ASCIIDOCOLLAB_AUTH_SESSION_ABSOLUTE_MAX_AGE: {
      type: 'integer',
      default: 86400000,
    },
    ASCIIDOCOLLAB_AUTH_COOKIE_SECURE: {
      type: 'boolean',
      default: true,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_MIN_LENGTH: {
      type: 'integer',
      default: 12,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_UPPERCASE: {
      type: 'boolean',
      default: true,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_LOWERCASE: {
      type: 'boolean',
      default: true,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_DIGITS: {
      type: 'boolean',
      default: true,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_SYMBOLS: {
      type: 'boolean',
      default: true,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_HISTORY_DEPTH: {
      type: 'integer',
      default: 5,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_MEMORY: {
      type: 'integer',
      default: 65536,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_TIME: {
      type: 'integer',
      default: 3,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_PARALLELISM: {
      type: 'integer',
      default: 1,
    },
    ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_MAX: {
      type: 'integer',
      default: 5,
    },
    ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_WINDOW: {
      type: 'integer',
      default: 900000,
    },
    ASCIIDOCOLLAB_AUTH_LOGIN_LOCKOUT_DURATION: {
      type: 'integer',
      default: 900000,
    },
    ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_MAX: {
      type: 'integer',
      default: 3,
    },
    ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_WINDOW: {
      type: 'integer',
      default: 3600000,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_TOKEN_EXPIRY: {
      type: 'integer',
      default: 3600000,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX: {
      type: 'integer',
      default: 3,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW: {
      type: 'integer',
      default: 3600000,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_MAX: {
      type: 'integer',
      default: 5,
    },
    ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_WINDOW: {
      type: 'integer',
      default: 900000,
    },
    ASCIIDOCOLLAB_AUTH_EMAIL_PROVIDER: {
      type: 'string',
      default: 'smtp',
    },
    ASCIIDOCOLLAB_AUTH_SMTP_HOST: {
      type: 'string',
      default: '',
    },
    ASCIIDOCOLLAB_AUTH_SMTP_PORT: {
      type: 'integer',
      default: 587,
    },
    ASCIIDOCOLLAB_AUTH_SMTP_USER: {
      type: 'string',
      default: '',
    },
    ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD: {
      type: 'string',
      default: '',
    },
    ASCIIDOCOLLAB_AUTH_SENDGRID_API_KEY: {
      type: 'string',
      default: '',
    },
    ASCIIDOCOLLAB_AUTH_SES_REGION: {
      type: 'string',
      default: '',
    },
    ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY: {
      type: 'string',
    },
  },
};

const configOptions = {
  schema,
  data: process.env,
  confKey: 'config',
};

/**
 * Fastify plugin that validates and loads environment variables.
 *
 * @param app - The Fastify instance to register the plugin on.
 */
export async function envConfig(app: FastifyInstance): Promise<void> {
  await app.register(fastifyEnv, configOptions);
}

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      ASCIIDOCOLLAB_API_PORT: number;
      ASCIIDOCOLLAB_API_HOST: string;
      ASCIIDOCOLLAB_API_TRUST_PROXY: boolean;
      ASCIIDOCOLLAB_API_CORS_ORIGINS: string;
      ASCIIDOCOLLAB_AUTH_SESSION_SECRET: string;
      ASCIIDOCOLLAB_AUTH_SESSION_MAX_AGE: number;
      ASCIIDOCOLLAB_AUTH_SESSION_ABSOLUTE_MAX_AGE: number;
      ASCIIDOCOLLAB_AUTH_COOKIE_SECURE: boolean;
      ASCIIDOCOLLAB_AUTH_PASSWORD_MIN_LENGTH: number;
      ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_UPPERCASE: boolean;
      ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_LOWERCASE: boolean;
      ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_DIGITS: boolean;
      ASCIIDOCOLLAB_AUTH_PASSWORD_REQUIRE_SYMBOLS: boolean;
      ASCIIDOCOLLAB_AUTH_PASSWORD_HISTORY_DEPTH: number;
      ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_MEMORY: number;
      ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_TIME: number;
      ASCIIDOCOLLAB_AUTH_PASSWORD_HASH_PARALLELISM: number;
      ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_MAX: number;
      ASCIIDOCOLLAB_AUTH_LOGIN_RATE_LIMIT_WINDOW: number;
      ASCIIDOCOLLAB_AUTH_LOGIN_LOCKOUT_DURATION: number;
      ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_MAX: number;
      ASCIIDOCOLLAB_AUTH_REGISTRATION_RATE_LIMIT_WINDOW: number;
      ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_TOKEN_EXPIRY: number;
      ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_MAX: number;
      ASCIIDOCOLLAB_AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW: number;
      ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_MAX: number;
      ASCIIDOCOLLAB_AUTH_PASSWORD_CHANGE_RATE_LIMIT_WINDOW: number;
      ASCIIDOCOLLAB_AUTH_EMAIL_PROVIDER: string;
      ASCIIDOCOLLAB_AUTH_SMTP_HOST: string;
      ASCIIDOCOLLAB_AUTH_SMTP_PORT: number;
      ASCIIDOCOLLAB_AUTH_SMTP_USER: string;
      ASCIIDOCOLLAB_AUTH_SMTP_PASSWORD: string;
      ASCIIDOCOLLAB_AUTH_SENDGRID_API_KEY: string;
      ASCIIDOCOLLAB_AUTH_SES_REGION: string;
      ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY: string;
    };
  }
}
