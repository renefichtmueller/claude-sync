/**
 * Tests for encryption module
 *
 * Note: Tests that require the `age` CLI tool are skipped if it's not installed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Encryption } from '../src/core/encryption.js';

describe('Encryption', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sync-enc-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('with encryption disabled', () => {
    it('copies files without modification', async () => {
      const enc = new Encryption({ enabled: false });
      const inputFile = path.join(tmpDir, 'input.txt');
      const outputFile = path.join(tmpDir, 'output.txt');

      await fs.writeFile(inputFile, 'test content');
      await enc.encryptFile(inputFile, outputFile);

      const result = await fs.readFile(outputFile, 'utf-8');
      expect(result).toBe('test content');
    });

    it('copies on decrypt without modification', async () => {
      const enc = new Encryption({ enabled: false });
      const inputFile = path.join(tmpDir, 'input.txt');
      const outputFile = path.join(tmpDir, 'output.txt');

      await fs.writeFile(inputFile, 'test content');
      await enc.decryptFile(inputFile, outputFile);

      const result = await fs.readFile(outputFile, 'utf-8');
      expect(result).toBe('test content');
    });

    it('copies entire directory tree', async () => {
      const enc = new Encryption({ enabled: false });
      const srcDir = path.join(tmpDir, 'src');
      const destDir = path.join(tmpDir, 'dest');

      // Create nested structure
      await fs.mkdir(path.join(srcDir, 'sub'), { recursive: true });
      await fs.writeFile(path.join(srcDir, 'a.txt'), 'file-a');
      await fs.writeFile(path.join(srcDir, 'sub', 'b.txt'), 'file-b');

      const count = await enc.encryptDirectory(srcDir, destDir);

      expect(count).toBe(2);
      expect(await fs.readFile(path.join(destDir, 'a.txt'), 'utf-8')).toBe('file-a');
      expect(await fs.readFile(path.join(destDir, 'sub', 'b.txt'), 'utf-8')).toBe('file-b');
    });
  });

  describe('isAvailable', () => {
    it('returns a boolean', async () => {
      const enc = new Encryption({ enabled: true });
      const available = await enc.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('with age available (integration)', async () => {
    const enc = new Encryption({ enabled: true });
    const ageAvailable = await enc.isAvailable();

    it.skipIf(!ageAvailable)('generates a keypair', async () => {
      const keyDir = path.join(tmpDir, 'keys');
      const { identityFile, publicKey } = await enc.generateKeypair(keyDir);

      expect(identityFile).toContain('age-identity.txt');
      expect(publicKey).toMatch(/^age1/);

      // Verify file exists and has restrictive permissions
      const stat = await fs.stat(identityFile);
      // On Unix, check file mode (owner read/write only)
      if (process.platform !== 'win32') {
        const mode = stat.mode & 0o777;
        expect(mode).toBe(0o600);
      }
    });

    it.skipIf(!ageAvailable)('encrypts and decrypts a file round-trip', async () => {
      const keyDir = path.join(tmpDir, 'keys');
      const encWithKeys = new Encryption({ enabled: true });
      await encWithKeys.generateKeypair(keyDir);

      const inputFile = path.join(tmpDir, 'plain.txt');
      const encryptedFile = path.join(tmpDir, 'encrypted.age');
      const decryptedFile = path.join(tmpDir, 'decrypted.txt');

      const originalContent = 'This is sensitive memory data!';
      await fs.writeFile(inputFile, originalContent);

      // Encrypt
      await encWithKeys.encryptFile(inputFile, encryptedFile);

      // Encrypted file should exist and be different from original
      const encrypted = await fs.readFile(encryptedFile);
      expect(encrypted.toString('utf-8')).not.toBe(originalContent);

      // Decrypt
      await encWithKeys.decryptFile(encryptedFile, decryptedFile);

      const decrypted = await fs.readFile(decryptedFile, 'utf-8');
      expect(decrypted).toBe(originalContent);
    });

    it.skipIf(!ageAvailable)('encrypts and decrypts a directory round-trip', async () => {
      const keyDir = path.join(tmpDir, 'keys');
      const encWithKeys = new Encryption({ enabled: true });
      await encWithKeys.generateKeypair(keyDir);

      const srcDir = path.join(tmpDir, 'src');
      const encDir = path.join(tmpDir, 'enc');
      const decDir = path.join(tmpDir, 'dec');

      await fs.mkdir(path.join(srcDir, 'memory'), { recursive: true });
      await fs.writeFile(path.join(srcDir, 'MEMORY.md'), '# My Memory');
      await fs.writeFile(path.join(srcDir, 'memory', 'notes.md'), 'Secret notes');

      // Encrypt directory
      const encCount = await encWithKeys.encryptDirectory(srcDir, encDir);
      expect(encCount).toBe(2);

      // Encrypted files should have .age extension
      const encFiles = await fs.readdir(encDir);
      expect(encFiles.some(f => f.endsWith('.age'))).toBe(true);

      // Decrypt directory
      const decCount = await encWithKeys.decryptDirectory(encDir, decDir);
      expect(decCount).toBe(2);

      // Verify content
      expect(await fs.readFile(path.join(decDir, 'MEMORY.md'), 'utf-8')).toBe('# My Memory');
      expect(await fs.readFile(path.join(decDir, 'memory', 'notes.md'), 'utf-8')).toBe('Secret notes');
    });
  });
});
