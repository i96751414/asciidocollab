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
 * @param configDirectory - Path to the config directory containing YAML files.
 */
export function loadConfig(configDirectory: string): void {
  const cfg = ensureConfig();
  const defaultPath = path.join(configDirectory, 'default.yaml');
  if (existsSync(defaultPath)) {
    const defaultContent = readFileSync(defaultPath, 'utf8');
    const defaultConfig = parseYaml(defaultContent);
    cfg.load(defaultConfig);
  }

  const environment = process.env.NODE_ENV || 'development';
  const environmentPath = path.join(configDirectory, `${environment}.yaml`);
  if (existsSync(environmentPath)) {
    const environmentContent = readFileSync(environmentPath, 'utf8');
    const environmentConfig = parseYaml(environmentContent);
    cfg.load(environmentConfig);
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
