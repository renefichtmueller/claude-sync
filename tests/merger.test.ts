/**
 * Tests for the smart conflict resolution merger
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Merger } from '../src/core/merger.js';

describe('Merger', () => {
  let merger: Merger;
  let tmpDir: string;

  beforeEach(async () => {
    merger = new Merger();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sync-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── Strategy Detection ────────────────────────────────────

  describe('getStrategy', () => {
    it('returns merge-append for memory files', () => {
      expect(merger.getStrategy('memory/MEMORY.md')).toBe('merge-append');
      expect(merger.getStrategy('projects/myapp/memory/notes.md')).toBe('merge-append');
    });

    it('returns merge-chrono for activity logs', () => {
      expect(merger.getStrategy('activity-log.md')).toBe('merge-chrono');
      expect(merger.getStrategy('projects/myapp/activity-log-2025.md')).toBe('merge-chrono');
    });

    it('returns latest-wins for settings', () => {
      expect(merger.getStrategy('settings.json')).toBe('latest-wins');
      expect(merger.getStrategy('settings/preferences.json')).toBe('latest-wins');
    });

    it('returns latest-wins for skills', () => {
      expect(merger.getStrategy('skills/my-skill.md')).toBe('latest-wins');
    });

    it('returns ask-user for CLAUDE.md', () => {
      expect(merger.getStrategy('CLAUDE.md')).toBe('ask-user');
      expect(merger.getStrategy('projects/myapp/CLAUDE.md')).toBe('ask-user');
    });

    it('returns latest-wins as default for unknown files', () => {
      expect(merger.getStrategy('random-file.txt')).toBe('latest-wins');
    });
  });

  // ── Merge: Identical Content ──────────────────────────────

  describe('merge — identical content', () => {
    it('detects identical files as no-conflict', async () => {
      const localFile = path.join(tmpDir, 'local.md');
      const remoteFile = path.join(tmpDir, 'remote.md');
      const content = '# Memory\n\nSome notes here.\n';

      await fs.writeFile(localFile, content);
      await fs.writeFile(remoteFile, content);

      const result = await merger.merge(localFile, remoteFile, 'memory/test.md');

      expect(result.conflict.resolved).toBe(true);
      expect(result.conflict.resolution).toBe('identical');
      expect(result.content).toBe(content);
    });
  });

  // ── Merge: Append Strategy ────────────────────────────────

  describe('merge — merge-append', () => {
    it('appends unique lines from both files', async () => {
      const localFile = path.join(tmpDir, 'local.md');
      const remoteFile = path.join(tmpDir, 'remote.md');

      await fs.writeFile(localFile, '# Memory\nLine A\nLine B\n');
      await fs.writeFile(remoteFile, '# Memory\nLine B\nLine C\n');

      const result = await merger.merge(localFile, remoteFile, 'memory/test.md');

      expect(result.conflict.resolved).toBe(true);
      expect(result.conflict.resolution).toBe('merged-append');
      expect(result.content).toContain('Line A');
      expect(result.content).toContain('Line B');
      expect(result.content).toContain('Line C');
      expect(result.content).toContain('# Memory');
    });

    it('deduplicates identical lines', async () => {
      const localFile = path.join(tmpDir, 'local.md');
      const remoteFile = path.join(tmpDir, 'remote.md');

      await fs.writeFile(localFile, 'Line A\nLine B\n');
      await fs.writeFile(remoteFile, 'Line A\nLine B\n');

      // Files differ only in that they're "the same" — but our test is about
      // ensuring dedup when content is different. Let's make them actually differ:
      await fs.writeFile(remoteFile, 'Line A\nLine C\n');

      const result = await merger.merge(localFile, remoteFile, 'memory/test.md');

      const lines = result.content.split('\n').filter(l => l.trim() !== '');
      const lineACount = lines.filter(l => l.trim() === 'Line A').length;
      expect(lineACount).toBe(1); // Deduplicated
    });
  });

  // ── Merge: Chronological Strategy ─────────────────────────

  describe('merge — merge-chrono', () => {
    it('sorts lines with dates chronologically', async () => {
      const localFile = path.join(tmpDir, 'local.md');
      const remoteFile = path.join(tmpDir, 'remote.md');

      await fs.writeFile(localFile, '2025-03-15 Did thing A\n2025-03-17 Did thing C\n');
      await fs.writeFile(remoteFile, '2025-03-16 Did thing B\n2025-03-18 Did thing D\n');

      const result = await merger.merge(localFile, remoteFile, 'activity-log.md');

      expect(result.conflict.resolved).toBe(true);
      const lines = result.content.split('\n').filter(l => l.trim() !== '');
      const dates = lines.map(l => l.substring(0, 10));
      expect(dates).toEqual([...dates].sort());
    });
  });

  // ── Merge: Latest Wins Strategy ───────────────────────────

  describe('merge — latest-wins', () => {
    it('picks the file with the later modification time', async () => {
      const localFile = path.join(tmpDir, 'local.json');
      const remoteFile = path.join(tmpDir, 'remote.json');

      await fs.writeFile(localFile, '{"theme": "dark"}');
      // Wait a tiny bit to ensure different mtime
      await new Promise(resolve => setTimeout(resolve, 50));
      await fs.writeFile(remoteFile, '{"theme": "light"}');

      const result = await merger.merge(localFile, remoteFile, 'settings.json');

      expect(result.conflict.resolved).toBe(true);
      expect(result.content).toBe('{"theme": "light"}');
    });
  });

  // ── Merge: Ask User Strategy ──────────────────────────────

  describe('merge — ask-user', () => {
    it('marks conflicts as unresolved for CLAUDE.md', async () => {
      const localFile = path.join(tmpDir, 'local.md');
      const remoteFile = path.join(tmpDir, 'remote.md');

      await fs.writeFile(localFile, '# Local Claude Config');
      await fs.writeFile(remoteFile, '# Remote Claude Config');

      const result = await merger.merge(localFile, remoteFile, 'CLAUDE.md');

      expect(result.conflict.resolved).toBe(false);
      expect(result.conflict.resolution).toBe('needs-user-input');
    });
  });

  // ── Diff Generation ───────────────────────────────────────

  describe('generateDiff', () => {
    it('produces a readable diff', () => {
      const local = 'Line 1\nLine 2\nLine 3';
      const remote = 'Line 1\nModified Line 2\nLine 3';

      const diff = merger.generateDiff(local, remote, 'test.md');

      expect(diff).toContain('--- local/test.md');
      expect(diff).toContain('+++ remote/test.md');
      expect(diff).toContain('- Line 2');
      expect(diff).toContain('+ Modified Line 2');
    });

    it('handles completely different files', () => {
      const diff = merger.generateDiff('AAA', 'BBB', 'test.md');
      expect(diff).toContain('- AAA');
      expect(diff).toContain('+ BBB');
    });
  });
});
