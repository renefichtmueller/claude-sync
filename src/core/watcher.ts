/**
 * File watcher — monitors .claude/ for changes and triggers sync
 *
 * Uses chokidar for cross-platform file watching with debouncing
 * to avoid excessive syncs during rapid edits.
 */

import * as path from 'node:path';
import type { FSWatcher } from 'chokidar';
import type { SyncBackend, SelectiveSyncConfig } from '../types.js';

export type WatcherCallback = (changedFiles: string[]) => Promise<void>;

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private pendingChanges: Set<string> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;
  private watchPath: string;
  private selectiveConfig: SelectiveSyncConfig;
  private callback: WatcherCallback;
  private _isRunning = false;

  constructor(
    watchPath: string,
    debounceMs: number,
    selectiveConfig: SelectiveSyncConfig,
    callback: WatcherCallback
  ) {
    this.watchPath = watchPath;
    this.debounceMs = debounceMs;
    this.selectiveConfig = selectiveConfig;
    this.callback = callback;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    if (this._isRunning) return;

    // Dynamic import chokidar (it's an ESM package in newer versions)
    const chokidar = await import('chokidar');

    const ignored = this.buildIgnorePatterns();

    this.watcher = chokidar.watch(this.watchPath, {
      ignored,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (filePath: string) => this.onFileChange(filePath))
      .on('change', (filePath: string) => this.onFileChange(filePath))
      .on('unlink', (filePath: string) => this.onFileChange(filePath));

    this._isRunning = true;
  }

  /**
   * Stop watching for file changes
   */
  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this._isRunning = false;

    // Flush any pending changes
    if (this.pendingChanges.size > 0) {
      const files = Array.from(this.pendingChanges);
      this.pendingChanges.clear();
      await this.callback(files);
    }
  }

  /**
   * Get number of pending (un-synced) changes
   */
  get pendingCount(): number {
    return this.pendingChanges.size;
  }

  // ── Private ────────────────────────────────────────────────────

  private onFileChange(filePath: string): void {
    const relativePath = path.relative(this.watchPath, filePath);

    // Check if this file should be synced based on selective config
    if (!this.shouldSync(relativePath)) return;

    this.pendingChanges.add(relativePath);

    // Debounce: wait for changes to settle before triggering sync
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      const files = Array.from(this.pendingChanges);
      this.pendingChanges.clear();

      if (files.length > 0) {
        await this.callback(files);
      }
    }, this.debounceMs);
  }

  private shouldSync(relativePath: string): boolean {
    if (this.selectiveConfig.mode === 'all') {
      // Check excludes only
      return !this.selectiveConfig.exclude.some((pattern) =>
        this.matchGlob(relativePath, pattern)
      );
    }

    // Selective mode: must match at least one include pattern
    const included = this.selectiveConfig.include.some((pattern) =>
      this.matchGlob(relativePath, pattern)
    );

    const excluded = this.selectiveConfig.exclude.some((pattern) =>
      this.matchGlob(relativePath, pattern)
    );

    return included && !excluded;
  }

  private buildIgnorePatterns(): string[] {
    const ignored = [
      '**/node_modules/**',
      '**/.git/**',
      '**/.claude-sync/**',
      '**/.*lock*',
    ];

    if (this.selectiveConfig.exclude.length > 0) {
      ignored.push(...this.selectiveConfig.exclude.map((p) => `**/${p}/**`));
    }

    return ignored;
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    // Simple glob matching
    const normalized = filePath.replace(/\\/g, '/');
    const regexStr = pattern
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*');

    return new RegExp(regexStr).test(normalized);
  }
}

/**
 * Create a watcher that auto-syncs using the provided backend
 */
export function createAutoSyncWatcher(
  claudeDir: string,
  debounceMs: number,
  selectiveConfig: SelectiveSyncConfig,
  backend: SyncBackend
): FileWatcher {
  return new FileWatcher(
    claudeDir,
    debounceMs,
    selectiveConfig,
    async (_changedFiles: string[]) => {
      try {
        await backend.push(claudeDir);
      } catch (err) {
        // Log but don't crash — background sync failures are non-fatal
        console.error('[claude-sync] Auto-sync push failed:', (err as Error).message);
      }
    }
  );
}
