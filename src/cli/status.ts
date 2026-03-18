/**
 * Status command — show current sync state
 */

import chalk from 'chalk';
import { loadConfig, getBackend } from './helpers.js';
import { DeviceRegistry } from '../core/device-registry.js';

interface StatusOptions {
  json?: boolean;
  short?: boolean;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const config = await loadConfig();
  if (!config) return;

  const backend = getBackend(config.backend);
  const status = await backend.status();

  if (options.json) {
    console.log(JSON.stringify({ ...status, device: config.deviceName, config: config.backend }, null, 2));
    return;
  }

  if (options.short) {
    // Compact status line suitable for shell prompts
    if (!status.connected) {
      console.log('[disconnected]');
    } else if (status.pendingChanges > 0 && status.availableUpdates > 0) {
      console.log(`[${status.pendingChanges} pending, ${status.availableUpdates} available]`);
    } else if (status.pendingChanges > 0) {
      console.log(`[${status.pendingChanges} changes pending]`);
    } else if (status.availableUpdates > 0) {
      console.log(`[${status.availableUpdates} updates available]`);
    } else {
      console.log('[synced]');
    }
    return;
  }

  // Full status display
  console.log('');
  console.log(chalk.cyan.bold('  claude-sync status'));
  console.log('');

  // Connection
  if (status.connected) {
    console.log(`  ${chalk.green('Connected')} via ${status.backend}`);
  } else {
    console.log(`  ${chalk.red('Disconnected')} — ${status.error ?? 'unknown error'}`);
  }

  // Device info
  console.log(`  ${chalk.dim('Device:')}  ${config.deviceName}`);

  // Last sync
  const lastSyncFormatted = DeviceRegistry.formatRelativeTime(status.lastSync);
  console.log(`  ${chalk.dim('Last sync:')} ${lastSyncFormatted}`);

  // Pending changes
  if (status.pendingChanges > 0) {
    console.log(`  ${chalk.yellow(`${status.pendingChanges} local change(s) pending push`)}`);
  }

  // Available updates
  if (status.availableUpdates > 0) {
    console.log(`  ${chalk.blue(`${status.availableUpdates} remote update(s) available`)}`);
  }

  // All synced
  if (status.connected && status.pendingChanges === 0 && status.availableUpdates === 0) {
    console.log(`  ${chalk.green('Everything is up to date.')}`);
  }

  // Config summary
  console.log('');
  console.log(chalk.dim('  Config:'));
  console.log(chalk.dim(`    Backend:    ${config.backend.type}`));
  console.log(chalk.dim(`    Encryption: ${config.encryption.enabled ? 'on' : 'off'}`));
  console.log(chalk.dim(`    Auto-sync:  ${config.autoSync.onSessionStart ? 'on' : 'off'}`));
  console.log(chalk.dim(`    Watcher:    ${config.autoSync.watchEnabled ? 'on' : 'off'}`));

  console.log('');
}
