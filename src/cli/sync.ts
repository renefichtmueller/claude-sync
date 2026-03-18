/**
 * Manual sync command — push and/or pull on demand
 */

import * as os from 'node:os';
import * as path from 'node:path';
import chalk from 'chalk';
import { loadConfig, getBackend } from './helpers.js';
import { SnapshotManager } from '../core/snapshot.js';
import { DeviceRegistry } from '../core/device-registry.js';

interface SyncOptions {
  push?: boolean;
  pull?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  const config = await loadConfig();
  if (!config) return;

  const backend = getBackend(config.backend);
  const claudeDir = path.join(os.homedir(), '.claude');
  const snapshot = new SnapshotManager();
  const registry = new DeviceRegistry();

  const doPush = options.push || (!options.push && !options.pull);
  const doPull = options.pull || (!options.push && !options.pull);

  if (options.dryRun) {
    console.log(chalk.dim('  [dry-run] No changes will be made'));
    console.log('');
  }

  // ── Pull Phase ─────────────────────────────────────────────

  if (doPull) {
    console.log(chalk.cyan('  Pulling remote changes...'));

    if (!options.dryRun) {
      // Create a snapshot before pulling (safety net)
      try {
        await snapshot.create(claudeDir, config.deviceId, config.deviceName, 'pre-pull backup');
      } catch {
        // Non-fatal if snapshot fails
      }

      const result = await backend.pull(claudeDir);

      if (result.success) {
        if (result.filesChanged.length === 0) {
          console.log(chalk.dim('  Already up to date.'));
        } else {
          console.log(chalk.green(`  Pulled ${result.filesChanged.length} file(s) in ${result.duration}ms`));
          for (const file of result.filesChanged.slice(0, 10)) {
            console.log(chalk.dim(`    ${file}`));
          }
          if (result.filesChanged.length > 10) {
            console.log(chalk.dim(`    ... and ${result.filesChanged.length - 10} more`));
          }
        }

        // Handle conflicts
        if (result.conflicts.length > 0) {
          console.log('');
          console.log(chalk.yellow(`  ${result.conflicts.length} conflict(s) detected:`));
          for (const conflict of result.conflicts) {
            if (conflict.resolved) {
              console.log(chalk.dim(`    ${conflict.filePath} — ${conflict.resolution}`));
            } else {
              console.log(chalk.yellow(`    ${conflict.filePath} — needs manual resolution`));
            }
          }
        }
      } else {
        console.log(chalk.red(`  Pull failed: ${result.error}`));
      }
    } else {
      const status = await backend.status();
      console.log(chalk.dim(`  Would pull ${status.availableUpdates} update(s)`));
    }

    console.log('');
  }

  // ── Push Phase ─────────────────────────────────────────────

  if (doPush) {
    console.log(chalk.cyan('  Pushing local changes...'));

    if (!options.dryRun) {
      const result = await backend.push(claudeDir);

      if (result.success) {
        if (result.filesChanged.length === 0) {
          console.log(chalk.dim('  Nothing to push.'));
        } else {
          console.log(chalk.green(`  Pushed ${result.filesChanged.length} file(s) in ${result.duration}ms`));
          for (const file of result.filesChanged.slice(0, 10)) {
            console.log(chalk.dim(`    ${file}`));
          }
          if (result.filesChanged.length > 10) {
            console.log(chalk.dim(`    ... and ${result.filesChanged.length - 10} more`));
          }
        }

        // Update device last-sync timestamp
        await registry.updateLastSync(config.deviceId);
      } else {
        console.log(chalk.red(`  Push failed: ${result.error}`));
      }
    } else {
      const status = await backend.status();
      console.log(chalk.dim(`  Would push ${status.pendingChanges} change(s)`));
    }

    console.log('');
  }
}
