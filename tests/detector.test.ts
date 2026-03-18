/**
 * Tests for environment detection
 */

import { describe, it, expect } from 'vitest';
import { detectEnvironment, suggestBackend } from '../src/core/detector.js';
import type { EnvironmentInfo } from '../src/types.js';

describe('detectEnvironment', () => {
  it('returns valid environment info', async () => {
    const env = await detectEnvironment();

    expect(env.os).toMatch(/^(darwin|linux|win32)$/);
    expect(env.homeDir).toBeTruthy();
    expect(env.claudeDir).toContain('.claude');
    expect(typeof env.hasGit).toBe('boolean');
    expect(typeof env.hasRsync).toBe('boolean');
    expect(typeof env.hasSyncthing).toBe('boolean');
    expect(typeof env.hasAge).toBe('boolean');
    expect(env.nodeVersion).toMatch(/^v\d+/);
    expect(Array.isArray(env.cloudStoragePaths)).toBe(true);
  });

  it('claudeDir is inside homeDir', async () => {
    const env = await detectEnvironment();
    expect(env.claudeDir.startsWith(env.homeDir)).toBe(true);
  });

  it('detects cloud storage paths with correct providers', async () => {
    const env = await detectEnvironment();

    for (const cloud of env.cloudStoragePaths) {
      expect(['dropbox', 'icloud', 'onedrive']).toContain(cloud.provider);
      expect(typeof cloud.path).toBe('string');
      expect(typeof cloud.exists).toBe('boolean');
    }
  });
});

describe('suggestBackend', () => {
  it('always includes custom as last option', () => {
    const env: EnvironmentInfo = {
      os: 'darwin',
      arch: 'arm64',
      homeDir: '/tmp/test',
      claudeDir: '/tmp/test/.claude',
      hasGit: false,
      hasRsync: false,
      hasSyncthing: false,
      hasAge: false,
      cloudStoragePaths: [],
      shell: '/bin/zsh',
      nodeVersion: 'v20.0.0',
    };

    const suggestions = suggestBackend(env);
    expect(suggestions[suggestions.length - 1]).toBe('custom');
  });

  it('suggests git when git is available', () => {
    const env: EnvironmentInfo = {
      os: 'darwin',
      arch: 'arm64',
      homeDir: '/tmp/test',
      claudeDir: '/tmp/test/.claude',
      hasGit: true,
      hasRsync: false,
      hasSyncthing: false,
      hasAge: false,
      cloudStoragePaths: [],
      shell: '/bin/zsh',
      nodeVersion: 'v20.0.0',
    };

    expect(suggestBackend(env)).toContain('git');
  });

  it('suggests cloud when cloud storage exists', () => {
    const env: EnvironmentInfo = {
      os: 'darwin',
      arch: 'arm64',
      homeDir: '/tmp/test',
      claudeDir: '/tmp/test/.claude',
      hasGit: false,
      hasRsync: false,
      hasSyncthing: false,
      hasAge: false,
      cloudStoragePaths: [
        { provider: 'dropbox', path: '/tmp/test/Dropbox', exists: true },
      ],
      shell: '/bin/zsh',
      nodeVersion: 'v20.0.0',
    };

    expect(suggestBackend(env)).toContain('cloud');
  });

  it('suggests syncthing when available', () => {
    const env: EnvironmentInfo = {
      os: 'linux',
      arch: 'x64',
      homeDir: '/tmp/test',
      claudeDir: '/tmp/test/.claude',
      hasGit: false,
      hasRsync: false,
      hasSyncthing: true,
      hasAge: false,
      cloudStoragePaths: [],
      shell: '/bin/bash',
      nodeVersion: 'v20.0.0',
    };

    expect(suggestBackend(env)).toContain('syncthing');
  });

  it('suggests rsync when available', () => {
    const env: EnvironmentInfo = {
      os: 'linux',
      arch: 'x64',
      homeDir: '/tmp/test',
      claudeDir: '/tmp/test/.claude',
      hasGit: false,
      hasRsync: true,
      hasSyncthing: false,
      hasAge: false,
      cloudStoragePaths: [],
      shell: '/bin/bash',
      nodeVersion: 'v20.0.0',
    };

    expect(suggestBackend(env)).toContain('rsync');
  });

  it('suggests multiple backends when many tools available', () => {
    const env: EnvironmentInfo = {
      os: 'darwin',
      arch: 'arm64',
      homeDir: '/tmp/test',
      claudeDir: '/tmp/test/.claude',
      hasGit: true,
      hasRsync: true,
      hasSyncthing: true,
      hasAge: true,
      cloudStoragePaths: [
        { provider: 'icloud', path: '/tmp/test/iCloud', exists: true },
      ],
      shell: '/bin/zsh',
      nodeVersion: 'v20.0.0',
    };

    const suggestions = suggestBackend(env);
    expect(suggestions.length).toBeGreaterThanOrEqual(4);
    expect(suggestions).toContain('git');
    expect(suggestions).toContain('cloud');
    expect(suggestions).toContain('syncthing');
    expect(suggestions).toContain('rsync');
  });
});
