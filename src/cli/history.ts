/**
 * History command — view and manage sync snapshots
 */

import chalk from 'chalk';
import { loadConfig, formatBytes } from './helpers.js';
import { SnapshotManager } from '../core/snapshot.js';
import { DeviceRegistry } from '../core/device-registry.js';

interface HistoryOptions {
  limit?: string;
  prune?: string;
  json?: boolean;
}

export async function historyCommand(options: HistoryOptions): Promise<void> {
  const config = await loadConfig();
  if (!config) return;

  const snapshots = new SnapshotManager();

  // ── Prune old snapshots ────────────────────────────────────

  if (options.prune) {
    const keepCount = parseInt(options.prune, 10);
    if (isNaN(keepCount) || keepCount < 1) {
      console.log(chalk.red('  Invalid prune count. Must be a positive number.'));
      return;
    }

    const deleted = await snapshots.prune(keepCount);
    console.log(chalk.green(`  Pruned ${deleted} snapshot(s). Keeping ${keepCount} most recent.`));
    return;
  }

  // ── List snapshots ─────────────────────────────────────────

  const limit = parseInt(options.limit ?? '10', 10);
  const all = await snapshots.list();
  const shown = all.slice(0, limit);

  if (options.json) {
    console.log(JSON.stringify(shown, null, 2));
    return;
  }

  console.log('');
  console.log(chalk.cyan.bold('  Sync History'));
  console.log('');

  if (shown.length === 0) {
    console.log(chalk.dim('  No snapshots yet. Snapshots are created automatically during sync.'));
    console.log('');
    return;
  }

  for (const snap of shown) {
    const age = DeviceRegistry.formatRelativeTime(snap.timestamp);
    const date = new Date(snap.timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    console.log(`  ${chalk.bold(snap.id)}  ${chalk.dim(date)}  (${age})`);
    console.log(chalk.dim(`    ${snap.fileCount} files, ${formatBytes(snap.sizeBytes)} — from ${snap.deviceName}`));
    if (snap.description) {
      console.log(chalk.dim(`    ${snap.description}`));
    }
    console.log('');
  }

  if (all.length > limit) {
    console.log(chalk.dim(`  Showing ${limit} of ${all.length}. Use --limit to see more.`));
    console.log('');
  }

  console.log(chalk.dim("  Restore with: claude-sync restore <id>"));
  console.log('');
}
