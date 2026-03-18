/**
 * Git sync backend — the recommended default
 *
 * Auto-commits and pushes .claude/ contents to a private Git repo.
 * On other devices, pulls the latest state.
 *
 * This is the best balance of version history, speed, and portability.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SyncBackend, BackendConfig, SyncResult, SyncStatus } from '../types.js';

const execFileAsync = promisify(execFile);

export class GitBackend implements SyncBackend {
  readonly type = 'git' as const;
  private repoDir: string;
  private remoteUrl: string;
  private branch: string;

  constructor(config?: BackendConfig) {
    this.repoDir = path.join(os.homedir(), '.claude-sync', 'repo');
    this.remoteUrl = config?.remoteUrl ?? '';
    this.branch = config?.branch ?? 'main';
  }

  async init(config: BackendConfig): Promise<void> {
    this.remoteUrl = config.remoteUrl ?? '';
    this.branch = config.branch ?? 'main';

    await fs.mkdir(this.repoDir, { recursive: true });

    // Check if already a git repo
    const isRepo = await this.isGitRepo();

    if (!isRepo) {
      if (this.remoteUrl) {
        // Clone the remote repo
        try {
          await execFileAsync('git', ['clone', this.remoteUrl, this.repoDir]);
        } catch {
          // Remote might be empty. Init locally and set remote.
          await execFileAsync('git', ['init', this.repoDir]);
          await this.git('remote', 'add', 'origin', this.remoteUrl);
          await this.git('checkout', '-b', this.branch);
        }
      } else {
        await execFileAsync('git', ['init', this.repoDir]);
        await this.git('checkout', '-b', this.branch);
      }
    }

    // Ensure .gitignore exists
    const gitignorePath = path.join(this.repoDir, '.gitignore');
    try {
      await fs.access(gitignorePath);
    } catch {
      await fs.writeFile(gitignorePath, '.DS_Store\nThumbs.db\n*.lock\n', 'utf-8');
    }
  }

  async push(sourcePath: string): Promise<SyncResult> {
    const start = Date.now();
    const filesChanged: string[] = [];

    try {
      // Copy .claude/ contents into the repo working directory
      await this.syncToRepo(sourcePath);

      // Stage all changes
      await this.git('add', '-A');

      // Check if there are changes to commit
      const { stdout: status } = await this.gitOutput('status', '--porcelain');

      if (status.trim() === '') {
        return {
          success: true,
          filesChanged: [],
          conflicts: [],
          timestamp: new Date().toISOString(),
          duration: Date.now() - start,
        };
      }

      // Parse changed files
      const lines = status.trim().split('\n');
      for (const line of lines) {
        const file = line.slice(3).trim();
        if (file) filesChanged.push(file);
      }

      // Commit
      const timestamp = new Date().toISOString();
      const hostname = os.hostname();
      await this.git('commit', '-m', `sync: ${hostname} at ${timestamp}`);

      // Push if remote is configured
      if (this.remoteUrl) {
        try {
          await this.git('push', 'origin', this.branch);
        } catch (err) {
          // Push failed (likely needs pull first)
          return {
            success: false,
            filesChanged,
            conflicts: [],
            timestamp,
            duration: Date.now() - start,
            error: `Push failed: ${(err as Error).message}. Try pulling first.`,
          };
        }
      }

      return {
        success: true,
        filesChanged,
        conflicts: [],
        timestamp,
        duration: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        filesChanged,
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
      const filesChanged: string[] = [];

      if (this.remoteUrl) {
        // Fetch and check for changes
        await this.git('fetch', 'origin', this.branch);

        const { stdout: diffOutput } = await this.gitOutput(
          'diff', '--name-only', `HEAD..origin/${this.branch}`
        );

        if (diffOutput.trim()) {
          filesChanged.push(...diffOutput.trim().split('\n'));
        }

        // Merge
        await this.git('merge', `origin/${this.branch}`, '--no-edit');
      }

      // Copy repo contents to the target .claude/ directory
      await this.syncFromRepo(targetPath);

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
      const isRepo = await this.isGitRepo();
      if (!isRepo) {
        return {
          connected: false,
          lastSync: null,
          pendingChanges: 0,
          availableUpdates: 0,
          backend: 'git',
          error: 'Git repo not initialized',
        };
      }

      // Count local uncommitted changes
      const { stdout: localStatus } = await this.gitOutput('status', '--porcelain');
      const pendingChanges = localStatus.trim()
        ? localStatus.trim().split('\n').length
        : 0;

      // Check for remote updates
      let availableUpdates = 0;
      if (this.remoteUrl) {
        try {
          await this.git('fetch', 'origin', this.branch);
          const { stdout: behindCount } = await this.gitOutput(
            'rev-list', '--count', `HEAD..origin/${this.branch}`
          );
          availableUpdates = parseInt(behindCount.trim(), 10) || 0;
        } catch {
          // Remote not available
        }
      }

      // Get last commit date
      let lastSync: string | null = null;
      try {
        const { stdout: lastDate } = await this.gitOutput(
          'log', '-1', '--format=%aI'
        );
        lastSync = lastDate.trim() || null;
      } catch {
        // No commits yet
      }

      return {
        connected: true,
        lastSync,
        pendingChanges,
        availableUpdates,
        backend: 'git',
      };
    } catch (err) {
      return {
        connected: false,
        lastSync: null,
        pendingChanges: 0,
        availableUpdates: 0,
        backend: 'git',
        error: (err as Error).message,
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('git', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  // ── Private helpers ────────────────────────────────────────────

  private async git(...args: string[]): Promise<void> {
    await execFileAsync('git', ['-C', this.repoDir, ...args]);
  }

  private async gitOutput(...args: string[]): Promise<{ stdout: string }> {
    return execFileAsync('git', ['-C', this.repoDir, ...args]);
  }

  private async isGitRepo(): Promise<boolean> {
    try {
      await fs.access(path.join(this.repoDir, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copy .claude/ contents into the git repo working directory
   */
  private async syncToRepo(sourcePath: string): Promise<void> {
    await this.copyTree(sourcePath, this.repoDir, ['.git']);
  }

  /**
   * Copy git repo contents to the .claude/ directory
   */
  private async syncFromRepo(targetPath: string): Promise<void> {
    await this.copyTree(this.repoDir, targetPath, ['.git', '.gitignore']);
  }

  private async copyTree(source: string, target: string, exclude: string[]): Promise<void> {
    await fs.mkdir(target, { recursive: true });

    let entries;
    try {
      entries = await fs.readdir(source, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const srcPath = path.join(source, entry.name);
      const destPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyTree(srcPath, destPath, exclude);
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}
