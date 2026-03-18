/**
 * Custom backend — bring your own sync command
 *
 * For users with unusual setups or who want to integrate
 * with their existing sync infrastructure.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SyncBackend, BackendConfig, SyncResult, SyncStatus } from '../types.js';

const execAsync = promisify(exec);

export class CustomBackend implements SyncBackend {
  readonly type = 'custom' as const;
  private pushCommand: string;
  private pullCommand: string;
  private statusCommand: string;

  constructor(config?: BackendConfig) {
    this.pushCommand = config?.pushCommand ?? '';
    this.pullCommand = config?.pullCommand ?? '';
    this.statusCommand = config?.statusCommand ?? '';
  }

  async init(config: BackendConfig): Promise<void> {
    this.pushCommand = config.pushCommand ?? '';
    this.pullCommand = config.pullCommand ?? '';
    this.statusCommand = config.statusCommand ?? '';

    if (!this.pushCommand || !this.pullCommand) {
      throw new Error(
        'Custom backend requires at least a push and pull command.\n' +
        'Example:\n' +
        '  claude-sync init --backend custom \\\n' +
        '    --push-cmd "rclone sync ~/.claude remote:claude-backup" \\\n' +
        '    --pull-cmd "rclone sync remote:claude-backup ~/.claude"'
      );
    }
  }

  async push(sourcePath: string): Promise<SyncResult> {
    const start = Date.now();

    try {
      const command = this.interpolateCommand(this.pushCommand, sourcePath);
      const { stdout } = await execAsync(command, {
        timeout: 120000,
        env: { ...process.env, CLAUDE_SYNC_SOURCE: sourcePath },
      });

      return {
        success: true,
        filesChanged: stdout.trim() ? stdout.trim().split('\n') : [],
        conflicts: [],
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        filesChanged: [],
        conflicts: [],
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }

  async pull(targetPath: string): Promise<SyncResult> {
    const start = Date.now();

    try {
      const command = this.interpolateCommand(this.pullCommand, targetPath);
      const { stdout } = await execAsync(command, {
        timeout: 120000,
        env: { ...process.env, CLAUDE_SYNC_TARGET: targetPath },
      });

      return {
        success: true,
        filesChanged: stdout.trim() ? stdout.trim().split('\n') : [],
        conflicts: [],
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        filesChanged: [],
        conflicts: [],
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }

  async status(): Promise<SyncStatus> {
    if (!this.statusCommand) {
      return {
        connected: true,
        lastSync: null,
        pendingChanges: 0,
        availableUpdates: 0,
        backend: 'custom',
      };
    }

    try {
      const claudeDir = path.join(os.homedir(), '.claude');
      const command = this.interpolateCommand(this.statusCommand, claudeDir);
      await execAsync(command, { timeout: 15000 });

      return {
        connected: true,
        lastSync: null,
        pendingChanges: 0,
        availableUpdates: 0,
        backend: 'custom',
      };
    } catch (err) {
      return {
        connected: false,
        lastSync: null,
        pendingChanges: 0,
        availableUpdates: 0,
        backend: 'custom',
        error: (err as Error).message,
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    return true; // Custom is always "available"
  }

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Replace placeholders in the command string:
   *   {path}     → the source/target path
   *   {home}     → user's home directory
   *   {hostname} → machine hostname
   */
  private interpolateCommand(command: string, pathValue: string): string {
    return command
      .replace(/\{path\}/g, pathValue)
      .replace(/\{home\}/g, os.homedir())
      .replace(/\{hostname\}/g, os.hostname());
  }
}
