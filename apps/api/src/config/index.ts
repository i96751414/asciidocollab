import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { createConfig } from './schema';
import type { Config } from './schema';

let config: ReturnType<typeof createConfig> | null = null;

function ensureConfig(): ReturnType<typeof createConfig> {
  if (!config) {
    config = createConfig();
  }
  return config;
}

/**
 * Loads configuration from YAML files and environment variables.
 *
 * Loading order:
 * 1. Load default.yaml (base defaults).
 * 2. Load {NODE_ENV}.yaml (environment override).
 * 3. Apply environment variable overrides (highest priority).
 *
 * @param configDir - Path to the config directory containing YAML files.
 */
export function loadConfig(configDir: string): void {
  const cfg = ensureConfig();
  const defaultPath = path.join(configDir, 'default.yaml');
  if (existsSync(defaultPath)) {
    const defaultContent = readFileSync(defaultPath, 'utf8');
    const defaultConfig = parseYaml(defaultContent);
    cfg.load(defaultConfig);
  }

  const env = process.env.NODE_ENV || 'development';
  const envPath = path.join(configDir, `${env}.yaml`);
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    const envConfig = parseYaml(envContent);
    cfg.load(envConfig);
  }

  cfg.validate({ allowed: 'strict' });
}

/**
 * Returns the validated configuration object.
 *
 * Uses JSON round-trip to convert convict's internal representation
 * to plain values matching the Config interface.
 *
 * @returns The configuration object with all fields typed.
 */
export function getConfig(): Config {
  return structuredClone(ensureConfig().getProperties()) as Config;
}

export { ensureConfig as config };
