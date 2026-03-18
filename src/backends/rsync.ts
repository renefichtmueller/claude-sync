/**
 * rsync backend — direct machine-to-machine sync over SSH
 *
 * For users who want maximum control and already have SSH
 * set up between their machines. No cloud, no intermediary.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SyncBackend, BackendConfig, SyncResult, SyncStatus } from '../types.js';

const execFileAsync = promisify(execFile);

export class RsyncBackend implements SyncBackend {
  readonly type = 'rsync' as const;
  private rsyncTarget: string;
  private sshKeyPath: string | undefined;

  constructor(config?: BackendConfig) {
    this.rsyncTarget = config?.rsyncTarget ?? '';
    this.sshKeyPath = config?.sshKeyPath;
  }

  async init(config: BackendConfig): Promise<void> {
    this.rsyncTarget = config.rsyncTarget ?? '';
    this.sshKeyPath = config.sshKeyPath;

    if (!this.rsyncTarget) {
      throw new Error(
        'rsync target is required. Format: user@host:/path/to/sync/dir\n' +
        'Example: claude-sync init --backend rsync --rsync-target me@server:~/.claude-sync-data'
      );
    }

    // Test SSH connection
    const sshArgs = this.buildSshArgs();
    const [hostPart] = this.rsyncTarget.split(':');

    try {
      await execFileAsync('ssh', [...sshArgs, hostPart, 'echo', 'ok'], {
        timeout: 10000,
      });
    } catch (err) {
      throw new Error(
        `Cannot connect to ${hostPart} via SSH: ${(err as Error).message}\n` +
        'Ensure SSH keys are set up and the host is reachable.'
      );
    }
  }

  async push(sourcePath: string): Promise<SyncResult> {
    const start = Date.now();

    try {
      const args = this.buildRsyncArgs(sourcePath + '/', this.rsyncTarget);
      const { stdout } = await execFileAsync('rsync', args, { timeout: 60000 });

      const filesChanged = this.parseRsyncOutput(stdout);

      return {
        success: true,
        filesChanged,
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
      const remoteSource = this.rsyncTarget.endsWith('/') ? this.rsyncTarget : this.rsyncTarget + '/';
      const args = this.buildRsyncArgs(remoteSource, targetPath);
      const { stdout } = await execFileAsync('rsync', args, { timeout: 60000 });

      const filesChanged = this.parseRsyncOutput(stdout);

      return {
        success: true,
        filesChanged,
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
    try {
      // Do a dry-run to check what would change
      const claudeDir = path.join(os.homedir(), '.claude');
      const args = [
        ...this.buildRsyncArgs(claudeDir + '/', this.rsyncTarget),
        '--dry-run',
      ];

      const { stdout } = await execFileAsync('rsync', args, { timeout: 15000 });
      const pending = this.parseRsyncOutput(stdout);

      return {
        connected: true,
        lastSync: null, // rsync doesn't track this natively
        pendingChanges: pending.length,
        availableUpdates: 0,
        backend: 'rsync',
      };
    } catch (err) {
      return {
        connected: false,
        lastSync: null,
        pendingChanges: 0,
        availableUpdates: 0,
        backend: 'rsync',
        error: (err as Error).message,
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('rsync', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  // ── Private helpers ────────────────────────────────────────────

  private buildRsyncArgs(source: string, dest: string): string[] {
    const args = [
      '-avz',              // archive, verbose, compress
      '--delete',          // remove files on dest that don't exist on source
      '--itemize-changes', // show what changed
      '--exclude', '.DS_Store',
      '--exclude', 'Thumbs.db',
      '--exclude', '*.lock',
    ];

    if (this.sshKeyPath) {
      args.push('-e', `ssh -i ${this.sshKeyPath}`);
    }

    args.push(source, dest);
    return args;
  }

  private buildSshArgs(): string[] {
    const args: string[] = [];
    if (this.sshKeyPath) {
      args.push('-i', this.sshKeyPath);
    }
    args.push('-o', 'ConnectTimeout=10');
    args.push('-o', 'BatchMode=yes');
    return args;
  }

  private parseRsyncOutput(output: string): string[] {
    // rsync --itemize-changes outputs lines like:
    // >f.st...... path/to/file
    return output
      .split('\n')
      .filter((line) => line.match(/^[<>ch.][fdLDS]/))
      .map((line) => line.replace(/^[<>ch.][fdLDS][cstpoguax.]{9}\s+/, '').trim())
      .filter(Boolean);
  }
}
