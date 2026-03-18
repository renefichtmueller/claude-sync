/**
 * Encryption at rest — uses age (https://age-encryption.org)
 *
 * Encrypts .claude/ contents before syncing so memory files
 * are never stored in plaintext on the sync target.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { EncryptionConfig } from '../types.js';

const execFileAsync = promisify(execFile);

export class Encryption {
  private config: EncryptionConfig;

  constructor(config: EncryptionConfig) {
    this.config = config;
  }

  /**
   * Check if age is installed
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('age', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a new age keypair
   * Returns { identityFile, publicKey }
   */
  async generateKeypair(outputDir?: string): Promise<{ identityFile: string; publicKey: string }> {
    const dir = outputDir ?? path.join(os.homedir(), '.claude-sync');
    await fs.mkdir(dir, { recursive: true });

    const identityFile = path.join(dir, 'age-identity.txt');

    const { stdout } = await execFileAsync('age-keygen', ['-o', identityFile]);

    // age-keygen prints the public key to stderr in the format:
    // Public key: age1xxxxx
    const publicKeyMatch = /age1[a-z0-9]+/.exec(stdout);
    let publicKey = '';

    if (publicKeyMatch) {
      publicKey = publicKeyMatch[0];
    } else {
      // Read it from the identity file comment
      const content = await fs.readFile(identityFile, 'utf-8');
      const match = /age1[a-z0-9]+/.exec(content);
      if (match) {
        publicKey = match[0];
      }
    }

    // Set restrictive permissions on the identity file
    await fs.chmod(identityFile, 0o600);

    this.config.identityFile = identityFile;
    this.config.recipientKey = publicKey;

    return { identityFile, publicKey };
  }

  /**
   * Encrypt a single file, writing the encrypted version to outputPath
   */
  async encryptFile(inputPath: string, outputPath: string): Promise<void> {
    if (!this.config.enabled || !this.config.recipientKey) {
      // No encryption, just copy
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.copyFile(inputPath, outputPath);
      return;
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await execFileAsync('age', [
      '-r', this.config.recipientKey,
      '-o', outputPath,
      inputPath,
    ]);
  }

  /**
   * Decrypt a single file, writing the decrypted version to outputPath
   */
  async decryptFile(inputPath: string, outputPath: string): Promise<void> {
    if (!this.config.enabled || !this.config.identityFile) {
      // No encryption, just copy
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.copyFile(inputPath, outputPath);
      return;
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await execFileAsync('age', [
      '-d',
      '-i', this.config.identityFile,
      '-o', outputPath,
      inputPath,
    ]);
  }

  /**
   * Encrypt an entire directory tree, maintaining the structure
   */
  async encryptDirectory(sourceDir: string, targetDir: string): Promise<number> {
    let count = 0;
    const entries = await this.walkDirectory(sourceDir);

    for (const entry of entries) {
      const relativePath = path.relative(sourceDir, entry);
      const outputPath = path.join(targetDir, relativePath + (this.config.enabled ? '.age' : ''));
      await this.encryptFile(entry, outputPath);
      count++;
    }

    return count;
  }

  /**
   * Decrypt an entire directory tree, stripping .age extensions
   */
  async decryptDirectory(sourceDir: string, targetDir: string): Promise<number> {
    let count = 0;
    const entries = await this.walkDirectory(sourceDir);

    for (const entry of entries) {
      let relativePath = path.relative(sourceDir, entry);
      if (relativePath.endsWith('.age')) {
        relativePath = relativePath.slice(0, -4);
      }
      const outputPath = path.join(targetDir, relativePath);
      await this.decryptFile(entry, outputPath);
      count++;
    }

    return count;
  }

  /**
   * Recursively walk a directory and return all file paths
   */
  private async walkDirectory(dir: string): Promise<string[]> {
    const results: string[] = [];

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await this.walkDirectory(fullPath);
        results.push(...sub);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }

    return results;
  }
}
