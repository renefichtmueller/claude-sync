/**
 * Environment detection — OS, available tools, cloud storage paths
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { EnvironmentInfo, CloudStoragePath, CloudProvider } from '../types.js';

const execFileAsync = promisify(execFile);

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    await execFileAsync(whichCmd, [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function getCloudStorageCandidates(homeDir: string, platform: string): Array<{ provider: CloudProvider; path: string }> {
  const candidates: Array<{ provider: CloudProvider; path: string }> = [];

  if (platform === 'darwin') {
    candidates.push(
      { provider: 'dropbox', path: path.join(homeDir, 'Dropbox') },
      { provider: 'icloud', path: path.join(homeDir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs') },
      { provider: 'onedrive', path: path.join(homeDir, 'OneDrive') },
    );
  } else if (platform === 'win32') {
    candidates.push(
      { provider: 'dropbox', path: path.join(homeDir, 'Dropbox') },
      { provider: 'onedrive', path: path.join(homeDir, 'OneDrive') },
      { provider: 'icloud', path: path.join(homeDir, 'iCloudDrive') },
    );
  } else {
    // Linux
    candidates.push(
      { provider: 'dropbox', path: path.join(homeDir, 'Dropbox') },
      { provider: 'onedrive', path: path.join(homeDir, 'OneDrive') },
    );
  }

  return candidates;
}

function getClaudeDir(homeDir: string): string {
  return path.join(homeDir, '.claude');
}

function getShell(): string {
  return process.env.SHELL ?? (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');
}

/**
 * Detect the current environment: OS, available tools, cloud storage
 */
export async function detectEnvironment(): Promise<EnvironmentInfo> {
  const homeDir = os.homedir();
  const platform = process.platform as 'darwin' | 'linux' | 'win32';

  const [hasGit, hasRsync, hasSyncthing, hasAge] = await Promise.all([
    commandExists('git'),
    commandExists('rsync'),
    commandExists('syncthing'),
    commandExists('age'),
  ]);

  const cloudCandidates = getCloudStorageCandidates(homeDir, platform);
  const cloudChecks = await Promise.all(
    cloudCandidates.map(async (c) => ({
      provider: c.provider,
      path: c.path,
      exists: await pathExists(c.path),
    }))
  );

  const cloudStoragePaths: CloudStoragePath[] = cloudChecks;

  return {
    os: platform,
    arch: os.arch(),
    homeDir,
    claudeDir: getClaudeDir(homeDir),
    hasGit,
    hasRsync,
    hasSyncthing,
    hasAge,
    cloudStoragePaths,
    shell: getShell(),
    nodeVersion: process.version,
  };
}

/**
 * Suggest the best sync backend based on available tools
 */
export function suggestBackend(env: EnvironmentInfo): string[] {
  const suggestions: string[] = [];

  if (env.hasGit) {
    suggestions.push('git');
  }

  const availableCloud = env.cloudStoragePaths.filter((c) => c.exists);
  if (availableCloud.length > 0) {
    suggestions.push('cloud');
  }

  if (env.hasSyncthing) {
    suggestions.push('syncthing');
  }

  if (env.hasRsync) {
    suggestions.push('rsync');
  }

  // Custom is always available
  suggestions.push('custom');

  return suggestions;
}
