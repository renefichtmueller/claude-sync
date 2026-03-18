/**
 * Config command — view or update configuration
 */

import chalk from 'chalk';
import { loadConfig, saveConfig } from './helpers.js';

interface ConfigOptions {
  include?: string;
  exclude?: string;
  encrypt?: boolean;
  autoSync?: boolean;
  watch?: boolean;
  json?: boolean;
  reset?: boolean;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  const config = await loadConfig();
  if (!config) return;

  let modified = false;

  // ── Reset ──────────────────────────────────────────────────

  if (options.reset) {
    config.selective = { mode: 'all', include: [], exclude: [] };
    config.autoSync = {
      onSessionStart: true,
      onSessionEnd: true,
      watchEnabled: true,
      watchDebounceMs: 2000,
    };
    modified = true;
    console.log(chalk.green('  Configuration reset to defaults.'));
  }

  // ── Selective sync ─────────────────────────────────────────

  if (options.include !== undefined) {
    config.selective.mode = 'selective';
    config.selective.include = options.include.split(',').map(s => s.trim()).filter(Boolean);
    modified = true;
    console.log(chalk.green(`  Include patterns: ${config.selective.include.join(', ')}`));
  }

  if (options.exclude !== undefined) {
    config.selective.exclude = options.exclude.split(',').map(s => s.trim()).filter(Boolean);
    modified = true;
    console.log(chalk.green(`  Exclude patterns: ${config.selective.exclude.join(', ')}`));
  }

  // ── Encryption ─────────────────────────────────────────────

  if (options.encrypt !== undefined) {
    config.encryption.enabled = options.encrypt;
    modified = true;
    console.log(chalk.green(`  Encryption: ${options.encrypt ? 'enabled' : 'disabled'}`));
  }

  // ── Auto-sync ──────────────────────────────────────────────

  if (options.autoSync !== undefined) {
    config.autoSync.onSessionStart = options.autoSync;
    config.autoSync.onSessionEnd = options.autoSync;
    modified = true;
    console.log(chalk.green(`  Auto-sync: ${options.autoSync ? 'enabled' : 'disabled'}`));
  }

  if (options.watch !== undefined) {
    config.autoSync.watchEnabled = options.watch;
    modified = true;
    console.log(chalk.green(`  File watcher: ${options.watch ? 'enabled' : 'disabled'}`));
  }

  // ── Save if modified ───────────────────────────────────────

  if (modified) {
    await saveConfig(config);
    console.log(chalk.dim('  Configuration saved.'));
    console.log('');
    return;
  }

  // ── Display current config ─────────────────────────────────

  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log('');
  console.log(chalk.cyan.bold('  claude-sync configuration'));
  console.log('');
  console.log(`  ${chalk.dim('Device:')}       ${config.deviceName} (${config.deviceId})`);
  console.log(`  ${chalk.dim('Backend:')}      ${config.backend.type}`);
  console.log('');
  console.log(chalk.dim('  Sync:'));
  console.log(`    ${chalk.dim('Auto on start:')} ${config.autoSync.onSessionStart ? 'yes' : 'no'}`);
  console.log(`    ${chalk.dim('Auto on end:')}   ${config.autoSync.onSessionEnd ? 'yes' : 'no'}`);
  console.log(`    ${chalk.dim('File watcher:')}  ${config.autoSync.watchEnabled ? 'yes' : 'no'}`);
  console.log(`    ${chalk.dim('Debounce:')}      ${config.autoSync.watchDebounceMs}ms`);
  console.log('');
  console.log(chalk.dim('  Selective sync:'));
  console.log(`    ${chalk.dim('Mode:')}     ${config.selective.mode}`);
  if (config.selective.include.length > 0) {
    console.log(`    ${chalk.dim('Include:')}  ${config.selective.include.join(', ')}`);
  }
  if (config.selective.exclude.length > 0) {
    console.log(`    ${chalk.dim('Exclude:')}  ${config.selective.exclude.join(', ')}`);
  }
  console.log('');
  console.log(chalk.dim('  Security:'));
  console.log(`    ${chalk.dim('Encryption:')} ${config.encryption.enabled ? 'on' : 'off'}`);
  console.log('');
}
