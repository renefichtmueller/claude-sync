/**
 * Gitea sync backend — self-hosted Git, full control
 *
 * Uses your local/intranet Gitea instance as the sync hub.
 * Works completely offline (no GitHub, no cloud dependency).
 *
 * Features beyond the plain Git backend:
 *  - Auto-creates the sync repo via Gitea API if it doesn't exist
 *  - Validates token and connectivity before init
 *  - Shows direct Gitea web UI link in status output
 *  - Multi-project mode: one repo per project namespace
 *  - Works on LAN, VPN, or public domain (gitea.yourserver.org)
 *
 * Setup example:
 *   claude-sync init --backend gitea \
 *     --gitea-url https://gitea.context-x.org \
 *     --gitea-token YOUR_TOKEN \
 *     --gitea-user rene
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import type { SyncBackend, BackendConfig, SyncResult, SyncStatus } from '../types.js'

const execFileAsync = promisify(execFile)

export class GiteaBackend implements SyncBackend {
  readonly type = 'gitea' as const

  private repoDir: string
  private baseUrl: string
  private token: string
  private user: string
  private repoName: string
  private branch: string

  constructor(config?: BackendConfig) {
    this.repoDir   = path.join(os.homedir(), '.claude-sync', 'gitea-repo')
    this.baseUrl   = (config?.giteaUrl  ?? 'http://localhost:3000').replace(/\/$/, '')
    this.token     = config?.giteaToken ?? ''
    this.user      = config?.giteaUser  ?? ''
    this.repoName  = config?.giteaRepo  ?? 'claude-memory'
    this.branch    = config?.branch     ?? 'main'
  }

  // ── Gitea API helpers ───────────────────────────────────────────────────

  private apiUrl(endpoint: string): string {
    return `${this.baseUrl}/api/v1${endpoint}`
  }

  private async apiGet(endpoint: string): Promise<unknown> {
    const res = await fetch(this.apiUrl(endpoint), {
      headers: { Authorization: `token ${this.token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`Gitea API ${res.status}: ${await res.text()}`)
    return res.json()
  }

  private async apiPost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(this.apiUrl(endpoint), {
      method: 'POST',
      headers: { Authorization: `token ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok && res.status !== 409) throw new Error(`Gitea API ${res.status}: ${await res.text()}`)
    return res.json()
  }

  /** Check if the sync repo exists on Gitea */
  private async repoExists(): Promise<boolean> {
    try {
      await this.apiGet(`/repos/${this.user}/${this.repoName}`)
      return true
    } catch {
      return false
    }
  }

  /** Create private repo on Gitea via API */
  private async createRepo(): Promise<void> {
    await this.apiPost('/user/repos', {
      name: this.repoName,
      description: 'claude-sync: Claude Code memory & settings (auto-managed)',
      private: true,
      auto_init: true,
      default_branch: this.branch,
    })
  }

  /** Validate token and server connectivity */
  async validateConnection(): Promise<{ ok: boolean; user?: string; serverVersion?: string; error?: string }> {
    try {
      const user = await this.apiGet('/user') as { login: string }
      const settings = await this.apiGet('/settings/api').catch(() => ({})) as { version?: string }
      return { ok: true, user: user.login, serverVersion: settings.version }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  // ── SyncBackend interface ───────────────────────────────────────────────

  async init(config: BackendConfig): Promise<void> {
    this.baseUrl  = (config.giteaUrl  ?? this.baseUrl).replace(/\/$/, '')
    this.token    = config.giteaToken ?? this.token
    this.user     = config.giteaUser  ?? this.user
    this.repoName = config.giteaRepo  ?? this.repoName
    this.branch   = config.branch     ?? this.branch

    // Validate connection first
    const check = await this.validateConnection()
    if (!check.ok) throw new Error(`Cannot connect to Gitea: ${check.error}`)

    // Auto-create repo if it doesn't exist
    if (!(await this.repoExists())) {
      await this.createRepo()
    }

    await fs.mkdir(this.repoDir, { recursive: true })

    const cloneUrl = this.cloneUrl()
    const isRepo = await this.isGitRepo()

    if (!isRepo) {
      try {
        await execFileAsync('git', ['clone', cloneUrl, this.repoDir])
      } catch {
        // Repo might be empty — init locally, set remote
        await execFileAsync('git', ['init', this.repoDir])
        await this.git('remote', 'add', 'origin', cloneUrl)
        await this.git('checkout', '-b', this.branch)
      }
    } else {
      // Update remote URL if token changed
      await this.git('remote', 'set-url', 'origin', cloneUrl)
    }

    // Configure git identity for commits
    await this.git('config', 'user.name', `claude-sync/${os.hostname()}`)
    await this.git('config', 'user.email', `claude-sync@${os.hostname()}`)

    // .gitignore
    const gitignorePath = path.join(this.repoDir, '.gitignore')
    try { await fs.access(gitignorePath) } catch {
      await fs.writeFile(gitignorePath, '.DS_Store\nThumbs.db\n*.lock\n*.swp\n', 'utf-8')
    }
  }

  async push(sourcePath: string): Promise<SyncResult> {
    const start = Date.now()
    const filesChanged: string[] = []

    try {
      await this.syncToRepo(sourcePath)
      await this.git('add', '-A')

      const { stdout: status } = await this.gitOutput('status', '--porcelain')
      if (status.trim() === '') {
        return { success: true, filesChanged: [], conflicts: [], timestamp: new Date().toISOString(), duration: Date.now() - start }
      }

      for (const line of status.trim().split('\n')) {
        const file = line.slice(3).trim()
        if (file) filesChanged.push(file)
      }

      const timestamp = new Date().toISOString()
      await this.git('commit', '-m', `sync: ${os.hostname()} at ${timestamp}`)

      try {
        await this.git('push', 'origin', this.branch)
      } catch {
        // Try push with upstream set
        await this.git('push', '--set-upstream', 'origin', this.branch)
      }

      return { success: true, filesChanged, conflicts: [], timestamp, duration: Date.now() - start }
    } catch (err) {
      return {
        success: false, filesChanged, conflicts: [],
        timestamp: new Date().toISOString(), duration: Date.now() - start,
        error: (err as Error).message,
      }
    }
  }

  async pull(targetPath: string): Promise<SyncResult> {
    const start = Date.now()

    try {
      const filesChanged: string[] = []

      await this.git('fetch', 'origin', this.branch)

      const { stdout: diffOutput } = await this.gitOutput(
        'diff', '--name-only', `HEAD..origin/${this.branch}`
      ).catch(() => ({ stdout: '' }))

      if (diffOutput.trim()) {
        filesChanged.push(...diffOutput.trim().split('\n'))
      }

      await this.git('merge', `origin/${this.branch}`, '--no-edit').catch(async () => {
        // If merge fails (e.g. diverged), reset to remote
        await this.git('reset', '--hard', `origin/${this.branch}`)
      })

      await this.syncFromRepo(targetPath)

      return { success: true, filesChanged, conflicts: [], timestamp: new Date().toISOString(), duration: Date.now() - start }
    } catch (err) {
      return {
        success: false, filesChanged: [], conflicts: [],
        timestamp: new Date().toISOString(), duration: Date.now() - start,
        error: (err as Error).message,
      }
    }
  }

  async status(): Promise<SyncStatus> {
    try {
      const isRepo = await this.isGitRepo()
      if (!isRepo) {
        return { connected: false, lastSync: null, pendingChanges: 0, availableUpdates: 0, backend: 'gitea', error: 'Not initialized' }
      }

      const { stdout: localStatus } = await this.gitOutput('status', '--porcelain')
      const pendingChanges = localStatus.trim() ? localStatus.trim().split('\n').length : 0

      let availableUpdates = 0
      try {
        await this.git('fetch', 'origin', this.branch)
        const { stdout: behindCount } = await this.gitOutput('rev-list', '--count', `HEAD..origin/${this.branch}`)
        availableUpdates = parseInt(behindCount.trim(), 10) || 0
      } catch { /* offline */ }

      let lastSync: string | null = null
      try {
        const { stdout: lastDate } = await this.gitOutput('log', '-1', '--format=%aI')
        lastSync = lastDate.trim() || null
      } catch { /* no commits */ }

      return { connected: true, lastSync, pendingChanges, availableUpdates, backend: 'gitea' }
    } catch (err) {
      return { connected: false, lastSync: null, pendingChanges: 0, availableUpdates: 0, backend: 'gitea', error: (err as Error).message }
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('git', ['--version'])
      const check = await this.validateConnection()
      return check.ok
    } catch {
      return false
    }
  }

  /** Direct link to the repo in Gitea web UI */
  webUrl(): string {
    return `${this.baseUrl}/${this.user}/${this.repoName}`
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private cloneUrl(): string {
    // Embed token in URL for auth (works with Gitea)
    const url = new URL(`${this.baseUrl}/${this.user}/${this.repoName}.git`)
    url.username = this.user
    url.password = this.token
    return url.toString()
  }

  private async git(...args: string[]): Promise<void> {
    await execFileAsync('git', ['-C', this.repoDir, ...args])
  }

  private async gitOutput(...args: string[]): Promise<{ stdout: string }> {
    return execFileAsync('git', ['-C', this.repoDir, ...args])
  }

  private async isGitRepo(): Promise<boolean> {
    try { await fs.access(path.join(this.repoDir, '.git')); return true } catch { return false }
  }

  private async syncToRepo(sourcePath: string): Promise<void> {
    await this.copyTree(sourcePath, this.repoDir, ['.git'])
  }

  private async syncFromRepo(targetPath: string): Promise<void> {
    await this.copyTree(this.repoDir, targetPath, ['.git', '.gitignore'])
  }

  private async copyTree(source: string, target: string, exclude: string[]): Promise<void> {
    await fs.mkdir(target, { recursive: true })
    let entries
    try { entries = await fs.readdir(source, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue
      const srcPath = path.join(source, entry.name)
      const destPath = path.join(target, entry.name)
      if (entry.isDirectory()) {
        await this.copyTree(srcPath, destPath, exclude)
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath)
      }
    }
  }
}
