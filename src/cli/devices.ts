/**
 * Devices command — list and manage connected devices
 */

import chalk from 'chalk';
import { loadConfig } from './helpers.js';
import { DeviceRegistry } from '../core/device-registry.js';

interface DevicesOptions {
  remove?: string;
  json?: boolean;
}

export async function devicesCommand(options: DevicesOptions): Promise<void> {
  const config = await loadConfig();
  if (!config) return;

  const registry = new DeviceRegistry();

  // ── Remove a device ──────────────────────────────────────────

  if (options.remove) {
    const removed = await registry.removeDevice(options.remove);
    if (removed) {
      console.log(chalk.green(`  Removed device: ${options.remove}`));
    } else {
      console.log(chalk.red(`  Device not found: ${options.remove}`));
    }
    return;
  }

  // ── List devices ─────────────────────────────────────────────

  const devices = await registry.getDevices();

  if (options.json) {
    console.log(JSON.stringify(devices, null, 2));
    return;
  }

  console.log('');
  console.log(chalk.cyan.bold('  Connected Devices'));
  console.log('');

  if (devices.length === 0) {
    console.log(chalk.dim('  No devices registered.'));
    console.log(chalk.dim("  Run 'claude-sync init' to register this device."));
    console.log('');
    return;
  }

  // Calculate column widths
  const maxNameLen = Math.max(...devices.map(d => d.name.length), 4);

  for (const device of devices) {
    const isCurrent = device.id === config.deviceId;
    const marker = isCurrent ? chalk.green(' (this device)') : '';
    const name = device.name.padEnd(maxNameLen);
    const lastSync = DeviceRegistry.formatRelativeTime(device.lastSync);
    const lastSeen = DeviceRegistry.formatRelativeTime(device.lastSeen);

    const osLabel = {
      darwin: 'macOS',
      linux: 'Linux',
      win32: 'Windows',
    }[device.os] ?? device.os;

    console.log(`  ${chalk.bold(name)}${marker}`);
    console.log(chalk.dim(`    OS: ${osLabel}  |  Last sync: ${lastSync}  |  Last seen: ${lastSeen}`));
    console.log(chalk.dim(`    ID: ${device.id}`));
    console.log('');
  }
}
