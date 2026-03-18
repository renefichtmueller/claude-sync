/**
 * Snapshot manager — creates and restores backups of .claude/ state
 *
 * Every sync creates a lightweight snapshot so you can roll back
 * to any previous point in time.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { CONFIG_DIR, SNAPSHOTS_DIR } from '../types.js';
import type { Snapshot } from '../types.js';

export class SnapshotManager {
  private snapshotsDir: string;
  private manifestFile: string;

  constructor(configDir?: string) {
    const base = configDir ?? path.join(os.homedir(), CONFIG_DIR);
    this.snapshotsDir = path.join(base, SNAPSHOTS_DIR);
    this.manifestFile = path.join(this.snapshotsDir, 'manifest.json');
  }

  /**
   * Create a snapshot of the given directory
   */
  async create(sourceDir: string, deviceId: string, deviceName: string, description?: string): Promise<Snapshot> {
    const id = crypto.randomBytes(6).toString('hex');
    const timestamp = new Date().toISOString();
    const snapshotDir = path.join(this.snapshotsDir, id);

    await fs.mkdir(snapshotDir, { recursive: true });

    // Copy entire directory tree
    const { fileCount, sizeBytes } = await this.copyDirectory(sourceDir, snapshotDir);

    const snapshot: Snapshot = {
      id,
      timestamp,
      deviceId,
      deviceName,
      fileCount,
      sizeBytes,
      description,
    };

    // Update manifest
    const manifest = await this.getManifest();
    manifest.push(snapshot);
    await this.saveManifest(manifest);

    return snapshot;
  }

  /**
   * Restore a snapshot to the target directory
   */
  async restore(snapshotId: string, targetDir: string): Promise<boolean> {
    const snapshotDir = path.join(this.snapshotsDir, snapshotId);

    try {
      await fs.access(snapshotDir);
    } catch {
      return false;
    }

    // Create a safety backup of the current state before restoring
    await this.copyDirectory(targetDir, targetDir + '.pre-restore');

    // Clear target and copy snapshot contents
    await fs.rm(targetDir, { recursive: true, force: true });
    await this.copyDirectory(snapshotDir, targetDir);

    return true;
  }

  /**
   * List all snapshots, newest first
   */
  async list(): Promise<Snapshot[]> {
    const manifest = await this.getManifest();
    return manifest.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * Find snapshots by date prefix (e.g., "2025-03-15")
   */
  async findByDate(datePrefix: string): Promise<Snapshot[]> {
    const all = await this.list();
    return all.filter((s) => s.timestamp.startsWith(datePrefix));
  }

  /**
   * Delete old snapshots, keeping the N most recent
   */
  async prune(keepCount: number): Promise<number> {
    const manifest = await this.getManifest();
    const sorted = manifest.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (sorted.length <= keepCount) return 0;

    const toDelete = sorted.slice(keepCount);
    let deleted = 0;

    for (const snap of toDelete) {
      const snapshotDir = path.join(this.snapshotsDir, snap.id);
      try {
        await fs.rm(snapshotDir, { recursive: true, force: true });
        deleted++;
      } catch {
        // Skip if already deleted
      }
    }

    const remaining = sorted.slice(0, keepCount);
    await this.saveManifest(remaining);

    return deleted;
  }

  // ── Private helpers ────────────────────────────────────────────

  private async getManifest(): Promise<Snapshot[]> {
    try {
      const content = await fs.readFile(this.manifestFile, 'utf-8');
      return JSON.parse(content) as Snapshot[];
    } catch {
      return [];
    }
  }

  private async saveManifest(manifest: Snapshot[]): Promise<void> {
    await fs.mkdir(this.snapshotsDir, { recursive: true });
    await fs.writeFile(this.manifestFile, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  private async copyDirectory(source: string, target: string): Promise<{ fileCount: number; sizeBytes: number }> {
    let fileCount = 0;
    let sizeBytes = 0;

    await fs.mkdir(target, { recursive: true });

    let entries;
    try {
      entries = await fs.readdir(source, { withFileTypes: true });
    } catch {
      return { fileCount, sizeBytes };
    }

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        const sub = await this.copyDirectory(srcPath, destPath);
        fileCount += sub.fileCount;
        sizeBytes += sub.sizeBytes;
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
        const stat = await fs.stat(srcPath);
        fileCount++;
        sizeBytes += stat.size;
      }
    }

    return { fileCount, sizeBytes };
  }
}
