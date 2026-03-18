/**
 * Device registry — tracks all machines connected to the sync
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { CONFIG_DIR, DEVICES_FILE } from '../types.js';
import type { DeviceInfo } from '../types.js';

export class DeviceRegistry {
  private configDir: string;
  private devicesFile: string;

  constructor(configDir?: string) {
    this.configDir = configDir ?? path.join(os.homedir(), CONFIG_DIR);
    this.devicesFile = path.join(this.configDir, DEVICES_FILE);
  }

  /**
   * Generate a stable device ID for this machine
   * Based on hostname + OS + home directory
   */
  generateDeviceId(): string {
    const raw = `${os.hostname()}-${process.platform}-${os.homedir()}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
  }

  /**
   * Create a DeviceInfo for the current machine
   */
  getCurrentDevice(name?: string): DeviceInfo {
    return {
      id: this.generateDeviceId(),
      name: name ?? os.hostname(),
      os: process.platform as 'darwin' | 'linux' | 'win32',
      hostname: os.hostname(),
      lastSync: null,
      lastSeen: new Date().toISOString(),
      claudePath: path.join(os.homedir(), '.claude'),
      version: process.env.npm_package_version ?? '0.1.0',
    };
  }

  /**
   * Load all registered devices
   */
  async getDevices(): Promise<DeviceInfo[]> {
    try {
      const content = await fs.readFile(this.devicesFile, 'utf-8');
      return JSON.parse(content) as DeviceInfo[];
    } catch {
      return [];
    }
  }

  /**
   * Register or update the current device in the registry
   */
  async registerDevice(device: DeviceInfo): Promise<void> {
    const devices = await this.getDevices();
    const existing = devices.findIndex((d) => d.id === device.id);

    if (existing >= 0) {
      devices[existing] = { ...devices[existing], ...device, lastSeen: new Date().toISOString() };
    } else {
      devices.push(device);
    }

    await fs.mkdir(this.configDir, { recursive: true });
    await fs.writeFile(this.devicesFile, JSON.stringify(devices, null, 2), 'utf-8');
  }

  /**
   * Update the lastSync timestamp for a device
   */
  async updateLastSync(deviceId: string): Promise<void> {
    const devices = await this.getDevices();
    const device = devices.find((d) => d.id === deviceId);

    if (device) {
      device.lastSync = new Date().toISOString();
      device.lastSeen = new Date().toISOString();
      await fs.writeFile(this.devicesFile, JSON.stringify(devices, null, 2), 'utf-8');
    }
  }

  /**
   * Remove a device from the registry
   */
  async removeDevice(deviceId: string): Promise<boolean> {
    const devices = await this.getDevices();
    const filtered = devices.filter((d) => d.id !== deviceId);

    if (filtered.length === devices.length) return false;

    await fs.writeFile(this.devicesFile, JSON.stringify(filtered, null, 2), 'utf-8');
    return true;
  }

  /**
   * Format a relative time string (e.g., "2 min ago", "1 hour ago")
   */
  static formatRelativeTime(isoDate: string | null): string {
    if (!isoDate) return 'never';

    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffMs = now - then;

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
  }
}
