/**
 * Smart conflict resolution — merges .claude/ files intelligently
 *
 * Strategies:
 *   merge-append  — Memory files: append new entries, deduplicate
 *   latest-wins   — Settings/skills: most recent timestamp wins
 *   merge-chrono  — Activity logs: merge chronologically
 *   ask-user      — CLAUDE.md: show diff, prompt user
 *   skip          — Leave both versions, don't resolve
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { DEFAULT_MERGE_RULES } from '../types.js';
import type { ConflictInfo, ConflictStrategy, MergeRule } from '../types.js';

export class Merger {
  private rules: MergeRule[];

  constructor(customRules?: MergeRule[]) {
    this.rules = customRules ?? DEFAULT_MERGE_RULES;
  }

  /**
   * Determine which merge strategy to use for a given file path
   */
  getStrategy(filePath: string): ConflictStrategy {
    const normalized = filePath.replace(/\\/g, '/');

    for (const rule of this.rules) {
      if (this.matchesPattern(normalized, rule.pattern)) {
        return rule.strategy;
      }
    }

    // Default: latest wins
    return 'latest-wins';
  }

  /**
   * Merge two versions of a file based on the configured strategy
   * Returns the merged content as a string
   */
  async merge(
    localPath: string,
    remotePath: string,
    relativePath: string
  ): Promise<{ content: string; conflict: ConflictInfo }> {
    const strategy = this.getStrategy(relativePath);
    const [localContent, remoteContent] = await Promise.all([
      fs.readFile(localPath, 'utf-8').catch(() => ''),
      fs.readFile(remotePath, 'utf-8').catch(() => ''),
    ]);

    const [localStat, remoteStat] = await Promise.all([
      fs.stat(localPath).catch(() => null),
      fs.stat(remotePath).catch(() => null),
    ]);

    const conflict: ConflictInfo = {
      filePath: relativePath,
      strategy,
      localModified: localStat?.mtime.toISOString() ?? '',
      remoteModified: remoteStat?.mtime.toISOString() ?? '',
      resolved: false,
    };

    // If content is identical, no conflict
    if (localContent === remoteContent) {
      conflict.resolved = true;
      conflict.resolution = 'identical';
      return { content: localContent, conflict };
    }

    let merged: string;

    switch (strategy) {
      case 'merge-append':
        merged = this.mergeAppend(localContent, remoteContent);
        conflict.resolved = true;
        conflict.resolution = 'merged-append';
        break;

      case 'merge-chrono':
        merged = this.mergeChrono(localContent, remoteContent);
        conflict.resolved = true;
        conflict.resolution = 'merged-chrono';
        break;

      case 'latest-wins':
        merged = this.latestWins(localContent, remoteContent, localStat, remoteStat);
        conflict.resolved = true;
        conflict.resolution = 'latest-wins';
        break;

      case 'ask-user':
        // Cannot auto-resolve. Return local content, mark unresolved.
        merged = localContent;
        conflict.resolved = false;
        conflict.resolution = 'needs-user-input';
        break;

      case 'skip':
        merged = localContent;
        conflict.resolved = false;
        conflict.resolution = 'skipped';
        break;

      default:
        merged = localContent;
        conflict.resolved = false;
        break;
    }

    return { content: merged, conflict };
  }

  /**
   * Generate a unified diff between two strings (for user display)
   */
  generateDiff(localContent: string, remoteContent: string, fileName: string): string {
    const localLines = localContent.split('\n');
    const remoteLines = remoteContent.split('\n');
    const output: string[] = [];

    output.push(`--- local/${fileName}`);
    output.push(`+++ remote/${fileName}`);

    // Simple line-by-line diff (not full unified diff, but good enough for user display)
    const maxLen = Math.max(localLines.length, remoteLines.length);
    let chunkStart = -1;
    const chunks: Array<{ start: number; localLines: string[]; remoteLines: string[] }> = [];
    let currentChunk: { start: number; localLines: string[]; remoteLines: string[] } | null = null;

    for (let i = 0; i < maxLen; i++) {
      const l = localLines[i] ?? '';
      const r = remoteLines[i] ?? '';

      if (l !== r) {
        if (!currentChunk) {
          chunkStart = i;
          currentChunk = { start: chunkStart, localLines: [], remoteLines: [] };
        }
        currentChunk.localLines.push(l);
        currentChunk.remoteLines.push(r);
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = null;
        }
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    for (const chunk of chunks) {
      output.push(`@@ line ${chunk.start + 1} @@`);
      for (const l of chunk.localLines) {
        output.push(`- ${l}`);
      }
      for (const r of chunk.remoteLines) {
        output.push(`+ ${r}`);
      }
    }

    return output.join('\n');
  }

  // ── Private merge implementations ──────────────────────────────

  /**
   * Merge by appending unique lines. Great for memory files.
   * Splits on section headers (## lines), deduplicates sections by hash.
   */
  private mergeAppend(local: string, remote: string): string {
    const localLines = local.split('\n');
    const remoteLines = remote.split('\n');

    // Collect unique lines by content hash
    const seen = new Set<string>();
    const result: string[] = [];

    for (const line of localLines) {
      const hash = this.lineHash(line);
      if (!seen.has(hash)) {
        seen.add(hash);
        result.push(line);
      }
    }

    for (const line of remoteLines) {
      const hash = this.lineHash(line);
      if (!seen.has(hash)) {
        seen.add(hash);
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * Merge chronologically. Expects lines with timestamps or date patterns.
   * Falls back to simple append-dedup if no timestamps found.
   */
  private mergeChrono(local: string, remote: string): string {
    const localLines = local.split('\n');
    const remoteLines = remote.split('\n');

    // Try to find timestamp patterns in lines
    const datePattern = /\d{4}-\d{2}-\d{2}/;

    interface TimedLine {
      text: string;
      date: string | null;
      hash: string;
    }

    const allLines: TimedLine[] = [];
    const seen = new Set<string>();

    for (const line of [...localLines, ...remoteLines]) {
      const hash = this.lineHash(line);
      if (seen.has(hash)) continue;
      seen.add(hash);

      const match = datePattern.exec(line);
      allLines.push({
        text: line,
        date: match ? match[0] : null,
        hash,
      });
    }

    // Sort: lines with dates come in chronological order, lines without dates keep original order
    const withDates = allLines.filter((l) => l.date !== null);
    const withoutDates = allLines.filter((l) => l.date === null);

    withDates.sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));

    // Reconstruct: header lines (no dates) first, then sorted dated lines
    return [...withoutDates, ...withDates].map((l) => l.text).join('\n');
  }

  /**
   * Latest modification timestamp wins
   */
  private latestWins(
    local: string,
    remote: string,
    localStat: { mtime: Date } | null,
    remoteStat: { mtime: Date } | null
  ): string {
    if (!localStat && !remoteStat) return local;
    if (!localStat) return remote;
    if (!remoteStat) return local;

    return localStat.mtime >= remoteStat.mtime ? local : remote;
  }

  /**
   * Simple glob pattern matching (supports ** and *)
   *
   * Patterns like ** /CLAUDE.md match any path ending with /CLAUDE.md
   * or the bare filename CLAUDE.md itself.
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // First, replace glob tokens with placeholders to protect them
    let regex = pattern
      .replace(/\*\*\//g, '\x00GLOBSTAR_SLASH\x00')
      .replace(/\*\*/g, '\x00GLOBSTAR\x00')
      .replace(/\*/g, '\x00STAR\x00')
      .replace(/\?/g, '\x00QUESTION\x00');

    // Escape regex special chars in the remaining literal text
    regex = regex.replace(/[.+^${}()|[\]\\]/g, '\\$&');

    // Replace placeholders with regex equivalents
    regex = regex
      .replace(/\x00GLOBSTAR_SLASH\x00/g, '(?:.*/)?')
      .replace(/\x00GLOBSTAR\x00/g, '.*')
      .replace(/\x00STAR\x00/g, '[^/]*')
      .replace(/\x00QUESTION\x00/g, '.');

    return new RegExp(`^${regex}$`).test(filePath);
  }

  /**
   * Hash a line for deduplication (ignores leading/trailing whitespace)
   */
  private lineHash(line: string): string {
    const trimmed = line.trim();
    if (trimmed === '') return `__empty_${Math.random()}__`;
    return crypto.createHash('md5').update(trimmed).digest('hex');
  }
}

/**
 * Resolve a conflict by writing the chosen content to the target path
 */
export async function resolveConflict(
  targetPath: string,
  content: string
): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf-8');
}
