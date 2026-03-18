/**
 * Shared CLI helpers — config loading, backend creation
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import chalk from 'chalk';
import { CONFIG_DIR, CONFIG_FILE } from '../types.js';
import type { SyncConfig, BackendConfig, SyncBackend } from '../types.js';
import { GitBackend } from '../backends/git.js';
import { CloudBackend } from '../backends/dropbox.js';
import { SyncthingBackend } from '../backends/syncthing.js';
import { RsyncBackend } from '../backends/rsync.js';
import { CustomBackend } from '../backends/custom.js';

/**
 * Load the sync configuration, or print an error and return null
 */
export async function loadConfig(): Promise<SyncConfig | null> {
  const configFile = path.join(os.homedir(), CONFIG_DIR, CONFIG_FILE);

  try {
    const content = await fs.readFile(configFile, 'utf-8');
    return JSON.parse(content) as SyncConfig;
  } catch {
    console.log(chalk.red("  claude-sync is not configured on this device."));
    console.log(chalk.dim("  Run 'claude-sync init' to set up."));
    console.log('');
    return null;
  }
}

/**
 * Save the sync configuration
 */
export async function saveConfig(config: SyncConfig): Promise<void> {
  const configDir = path.join(os.homedir(), CONFIG_DIR);
  const configFile = path.join(configDir, CONFIG_FILE);
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Create the appropriate backend from config
 */
export function getBackend(backendConfig: BackendConfig): SyncBackend {
  switch (backendConfig.type) {
    case 'git':
      return new GitBackend(backendConfig);
    case 'cloud':
      return new CloudBackend(backendConfig);
    case 'syncthing':
      return new SyncthingBackend(backendConfig);
    case 'rsync':
      return new RsyncBackend(backendConfig);
    case 'custom':
      return new CustomBackend(backendConfig);
    default:
      throw new Error(`Unknown backend type: ${backendConfig.type}`);
  }
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
