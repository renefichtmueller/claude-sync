/**
 * Session start hook — pull latest changes when Claude Code starts
 *
 * This runs automatically (if enabled) when a new Claude Code session begins.
 * It pulls the latest .claude/ state from other devices so Claude has
 * the most up-to-date memory and context.
 *
 * Usage:
 *   Add to your shell profile or Claude Code hooks:
 *   claude-sync hook:start
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { CONFIG_DIR, CONFIG_FILE, SYNC_LOCK_FILE } from '../types.js';
import type { SyncConfig } from '../types.js';
import { GitBackend } from '../backends/git.js';
import { CloudBackend } from '../backends/dropbox.js';
import { SyncthingBackend } from '../backends/syncthing.js';
import { RsyncBackend } from '../backends/rsync.js';
import { CustomBackend } from '../backends/custom.js';
import { DeviceRegistry } from '../core/device-registry.js';
import { SnapshotManager } from '../core/snapshot.js';

/**
 * Run the session-start sync (pull)
 * Returns a summary string for display
 */
export async function onSessionStart(): Promise<string> {
  const config = await loadConfig();
  if (!config) return '';
  if (!config.autoSync.onSessionStart) return '';

  // Check for lock file to prevent concurrent syncs
  const lockFile = path.join(os.homedir(), CONFIG_DIR, SYNC_LOCK_FILE);
  if (await fileExists(lockFile)) {
    return '[claude-sync] Another sync is in progress';
  }

  try {
    // Create lock
    await fs.writeFile(lockFile, `${process.pid}`, 'utf-8');

    const claudeDir = path.join(os.homedir(), '.claude');
    const backend = createBackend(config);

    // Create a snapshot before pulling (safety net)
    const snapshots = new SnapshotManager();
    try {
      await snapshots.create(claudeDir, config.deviceId, config.deviceName, 'session-start backup');
    } catch {
      // Non-fatal
    }

    // Pull latest changes
    const result = await backend.pull(claudeDir);

    // Update device registry
    const registry = new DeviceRegistry();
    await registry.updateLastSync(config.deviceId);

    if (!result.success) {
      return `[claude-sync] Pull failed: ${result.error}`;
    }

    if (result.filesChanged.length === 0) {
      return '[claude-sync] Up to date';
    }

    return `[claude-sync] Pulled ${result.filesChanged.length} update(s) from other devices`;
  } catch (err) {
    return `[claude-sync] Error: ${(err as Error).message}`;
  } finally {
    // Release lock
    try {
      await fs.unlink(lockFile);
    } catch {
      // Ignore
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

async function loadConfig(): Promise<SyncConfig | null> {
  try {
    const configFile = path.join(os.homedir(), CONFIG_DIR, CONFIG_FILE);
    const content = await fs.readFile(configFile, 'utf-8');
    return JSON.parse(content) as SyncConfig;
  } catch {
    return null;
  }
}

function createBackend(config: SyncConfig) {
  switch (config.backend.type) {
    case 'git': return new GitBackend(config.backend);
    case 'cloud': return new CloudBackend(config.backend);
    case 'syncthing': return new SyncthingBackend(config.backend);
    case 'rsync': return new RsyncBackend(config.backend);
    case 'custom': return new CustomBackend(config.backend);
    default: throw new Error(`Unknown backend: ${config.backend.type}`);
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
