import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { config } from './schema';
import type { Config } from './schema';

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
  const defaultPath = join(configDir, 'default.yaml');
  if (existsSync(defaultPath)) {
    const defaultContent = readFileSync(defaultPath, 'utf-8');
    const defaultConfig = parseYaml(defaultContent);
    config.load(defaultConfig);
  }

  const env = process.env.NODE_ENV || 'development';
  const envPath = join(configDir, `${env}.yaml`);
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    const envConfig = parseYaml(envContent);
    config.load(envConfig);
  }

  config.validate({ allowed: 'strict' });
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
  return JSON.parse(JSON.stringify(config.getProperties())) as Config;
}

export { config };
