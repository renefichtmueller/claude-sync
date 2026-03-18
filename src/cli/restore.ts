/**
 * Restore command — roll back .claude/ to a previous snapshot
 */

import * as os from 'node:os';
import * as path from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig } from './helpers.js';
import { SnapshotManager } from '../core/snapshot.js';

interface RestoreOptions {
  force?: boolean;
}

export async function restoreCommand(snapshotRef: string, options: RestoreOptions): Promise<void> {
  const config = await loadConfig();
  if (!config) return;

  const snapshots = new SnapshotManager();
  const claudeDir = path.join(os.homedir(), '.claude');

  // Find the snapshot — by ID or by date prefix
  let snapshotId: string | null = null;

  // Try direct ID match first
  const all = await snapshots.list();
  const directMatch = all.find(s => s.id === snapshotRef);

  if (directMatch) {
    snapshotId = directMatch.id;
  } else {
    // Try date prefix match
    const dateMatches = await snapshots.findByDate(snapshotRef);

    if (dateMatches.length === 0) {
      console.log(chalk.red(`  No snapshot found for: ${snapshotRef}`));
      console.log(chalk.dim("  Run 'claude-sync history' to see available snapshots."));
      return;
    }

    if (dateMatches.length === 1) {
      snapshotId = dateMatches[0].id;
    } else {
      // Multiple matches for this date — let user choose
      console.log(chalk.yellow(`  Multiple snapshots found for ${snapshotRef}:`));
      console.log('');

      const { chosen } = await inquirer.prompt([{
        type: 'list',
        name: 'chosen',
        message: 'Which snapshot?',
        choices: dateMatches.map(s => ({
          name: `${s.id} — ${new Date(s.timestamp).toLocaleString()} (${s.deviceName}, ${s.fileCount} files)`,
          value: s.id,
        })),
      }]);

      snapshotId = chosen;
    }
  }

  if (!snapshotId) {
    console.log(chalk.red('  No snapshot selected.'));
    return;
  }

  const snapshot = all.find(s => s.id === snapshotId);

  // Confirm with user
  if (!options.force) {
    console.log('');
    console.log(chalk.yellow('  This will replace your current .claude/ contents with the snapshot.'));
    console.log(chalk.dim(`  Snapshot: ${snapshotId}`));
    console.log(chalk.dim(`  Date: ${snapshot ? new Date(snapshot.timestamp).toLocaleString() : 'unknown'}`));
    console.log(chalk.dim(`  Files: ${snapshot?.fileCount ?? 'unknown'}`));
    console.log(chalk.dim('  A backup of the current state will be saved first.'));
    console.log('');

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Proceed with restore?',
      default: false,
    }]);

    if (!confirm) {
      console.log(chalk.dim('  Restore cancelled.'));
      return;
    }
  }

  // Perform restore
  console.log(chalk.dim('  Restoring...'));

  const success = await snapshots.restore(snapshotId, claudeDir);

  if (success) {
    console.log(chalk.green('  Restore complete.'));
    console.log(chalk.dim('  A backup of the previous state was saved to ~/.claude.pre-restore'));
  } else {
    console.log(chalk.red('  Restore failed. Snapshot data not found.'));
  }

  console.log('');
}
