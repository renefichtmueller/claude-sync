/**
 * Cloud storage backend — Dropbox, iCloud, OneDrive
 *
 * Uses symlinks to redirect .claude/ into a cloud-synced folder.
 * The cloud provider handles the actual sync.
 *
 * This is the easiest setup — just symlink and forget.
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SyncBackend, BackendConfig, SyncResult, SyncStatus, CloudProvider } from '../types.js';

const CLOUD_SUBDIR = 'claude-sync';

export class CloudBackend implements SyncBackend {
  readonly type = 'cloud' as const;
  private provider: CloudProvider;
  private cloudPath: string;
  private syncDir: string;

  constructor(config?: BackendConfig) {
    this.provider = config?.cloudProvider ?? 'dropbox';
    this.cloudPath = config?.cloudPath ?? '';
    this.syncDir = this.cloudPath ? path.join(this.cloudPath, CLOUD_SUBDIR) : '';
  }

  async init(config: BackendConfig): Promise<void> {
    this.provider = config.cloudProvider ?? 'dropbox';
    this.cloudPath = config.cloudPath ?? this.detectCloudPath();
    this.syncDir = path.join(this.cloudPath, CLOUD_SUBDIR);

    if (!this.cloudPath) {
      throw new Error(
        `Could not detect ${this.provider} folder. Please specify the path with --cloud-path.`
      );
    }

    // Create the sync subdirectory in the cloud folder
    await fs.mkdir(this.syncDir, { recursive: true });

    // Create a marker file so other devices know this is a claude-sync folder
    const markerFile = path.join(this.syncDir, '.claude-sync-marker');
    const marker = {
      provider: this.provider,
      createdAt: new Date().toISOString(),
      hostname: os.hostname(),
    };
    await fs.writeFile(markerFile, JSON.stringify(marker, null, 2), 'utf-8');
  }

  async push(sourcePath: string): Promise<SyncResult> {
    const start = Date.now();

    try {
      if (!this.syncDir) {
        throw new Error('Cloud backend not initialized. Run claude-sync init first.');
      }

      const filesChanged = await this.copyTree(sourcePath, this.syncDir);

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
      if (!this.syncDir) {
        throw new Error('Cloud backend not initialized. Run claude-sync init first.');
      }

      const filesChanged = await this.copyTree(this.syncDir, targetPath, ['.claude-sync-marker']);

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
      if (!this.syncDir) {
        return {
          connected: false,
          lastSync: null,
          pendingChanges: 0,
          availableUpdates: 0,
          backend: 'cloud',
          error: 'Cloud backend not initialized',
        };
      }

      // Check if the cloud folder exists
      await fs.access(this.syncDir);

      // Check marker file for last sync time
      const markerPath = path.join(this.syncDir, '.claude-sync-marker');
      let lastSync: string | null = null;

      try {
        const stat = await fs.stat(markerPath);
        lastSync = stat.mtime.toISOString();
      } catch {
        // No marker
      }

      return {
        connected: true,
        lastSync,
        pendingChanges: 0,
        availableUpdates: 0,
        backend: 'cloud',
      };
    } catch (err) {
      return {
        connected: false,
        lastSync: null,
        pendingChanges: 0,
        availableUpdates: 0,
        backend: 'cloud',
        error: (err as Error).message,
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    const cloudPath = this.cloudPath || this.detectCloudPath();
    if (!cloudPath) return false;

    try {
      await fs.access(cloudPath);
      return true;
    } catch {
      return false;
    }
  }

  // ── Private helpers ────────────────────────────────────────────

  private detectCloudPath(): string {
    const homeDir = os.homedir();

    const paths: Record<CloudProvider, string[]> = {
      dropbox: [path.join(homeDir, 'Dropbox')],
      icloud: [
        path.join(homeDir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
        path.join(homeDir, 'iCloudDrive'),
      ],
      onedrive: [path.join(homeDir, 'OneDrive')],
    };

    const candidates = paths[this.provider] ?? [];
    // We can't use async here, so do a best-effort sync check
    for (const p of candidates) {
      try {
        if (fsSync.existsSync(p)) {
          return p;
        }
      } catch {
        continue;
      }
    }

    return '';
  }

  private async copyTree(source: string, target: string, exclude: string[] = []): Promise<string[]> {
    const changed: string[] = [];
    await fs.mkdir(target, { recursive: true });

    let entries;
    try {
      entries = await fs.readdir(source, { withFileTypes: true });
    } catch {
      return changed;
    }

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;
      if (entry.name.startsWith('.claude-sync')) continue;

      const srcPath = path.join(source, entry.name);
      const destPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        const sub = await this.copyTree(srcPath, destPath, exclude);
        changed.push(...sub);
      } else if (entry.isFile()) {
        // Only copy if content differs
        let shouldCopy = true;
        try {
          const [srcContent, destContent] = await Promise.all([
            fs.readFile(srcPath),
            fs.readFile(destPath),
          ]);
          shouldCopy = !srcContent.equals(destContent);
        } catch {
          // Destination doesn't exist, copy
        }

        if (shouldCopy) {
          await fs.copyFile(srcPath, destPath);
          changed.push(path.relative(source, srcPath));
        }
      }
    }

    return changed;
  }
}
