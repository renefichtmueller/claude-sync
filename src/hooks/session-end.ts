/**
 * Session end hook — push local changes when Claude Code session ends
 *
 * This runs automatically (if enabled) when a Claude Code session ends.
 * It pushes local .claude/ changes so other devices can pick them up.
 *
 * Usage:
 *   Add to your shell profile or Claude Code hooks:
 *   claude-sync hook:end
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
 * Run the session-end sync (push)
 * Returns a summary string for display
 */
export async function onSessionEnd(): Promise<string> {
  const config = await loadConfig();
  if (!config) return '';
  if (!config.autoSync.onSessionEnd) return '';

  // Check for lock file
  const lockFile = path.join(os.homedir(), CONFIG_DIR, SYNC_LOCK_FILE);
  if (await fileExists(lockFile)) {
    return '[claude-sync] Another sync is in progress';
  }

  try {
    // Create lock
    await fs.writeFile(lockFile, `${process.pid}`, 'utf-8');

    const claudeDir = path.join(os.homedir(), '.claude');
    const backend = createBackend(config);

    // Create a snapshot before pushing (for history)
    const snapshots = new SnapshotManager();
    try {
      await snapshots.create(claudeDir, config.deviceId, config.deviceName, 'session-end snapshot');
    } catch {
      // Non-fatal
    }

    // Push local changes
    const result = await backend.push(claudeDir);

    // Update device registry
    const registry = new DeviceRegistry();
    await registry.updateLastSync(config.deviceId);

    // Auto-prune old snapshots (keep last 50)
    try {
      await snapshots.prune(50);
    } catch {
      // Non-fatal
    }

    if (!result.success) {
      return `[claude-sync] Push failed: ${result.error}`;
    }

    if (result.filesChanged.length === 0) {
      return '[claude-sync] No changes to push';
    }

    return `[claude-sync] Pushed ${result.filesChanged.length} change(s)`;
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
