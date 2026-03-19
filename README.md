<div align="center">

# claude-sync

> **[🚀 Live Demo](https://claude-sync-demo.pages.dev)** — Try it in your browser, no installation needed.

### One Claude brain across all your devices

**Switch machines, keep the context.** Your Claude Code memory, skills, and settings follow you everywhere.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick Start](#quick-start) | [The Problem](#the-problem) | [Features](#features) | [Backends](#sync-backends) | [Docs](docs/)

</div>

---

## Quick Start

```bash
# 1. Install
npm install -g claude-sync

# 2. Set up (interactive wizard)
claude-sync init

# 3. Done. Claude remembers everything, everywhere.
```

That's it. Three commands. Now your `.claude/` directory syncs across all your machines.

---

## The Problem

You're a vibecoder. You work on your desktop at home in the evening. You switch to your laptop during the day. Maybe you have a work machine too.

Every time you switch:

- **Monday morning, open laptop:** "What framework are we using again?" *(Claude asks for the fifth time)*
- **Switch to desktop:** All the context from your laptop session? Gone.
- **New machine:** Spend 30 minutes re-explaining your projects, preferences, and patterns.

Claude Code's `.claude/` directory stores everything — your memory, your skills, your project context, your preferences. But it's **local-only**. Switch devices and Claude has amnesia.

## The Solution

| | Without claude-sync | With claude-sync |
|---|---|---|
| **Switch devices** | Re-explain everything | Claude already knows |
| **New machine** | 30 min setup | `claude-sync init` (30 sec) |
| **Memory** | Lost on each device | Merged across all devices |
| **Skills** | Device-specific | Available everywhere |
| **Settings** | Manual copy | Auto-synced |
| **Activity logs** | Fragmented | Unified timeline |
| **Project context** | Starts fresh | Picks up where you left off |

---

## Features

### Zero-Config Setup

One command. Detects your OS, suggests the best sync method, sets up everything.

```
claude-sync init

  ? What's this device's name? [MacBook-Pro]
  ? How do you want to sync?
    > Git (recommended)
      iCloud / Dropbox / OneDrive
      Syncthing (P2P)
      rsync over SSH
      Custom command

  Setup complete!
```

### Multiple Sync Backends

Choose what works for you. Git for developers. iCloud for simplicity. Syncthing for privacy. rsync for control.

### Smart Conflict Resolution

When two devices edit the same file, claude-sync knows what to do:

| File Type | Strategy | How It Works |
|-----------|----------|-------------|
| Memory files | Merge & Append | New entries from both devices, deduplicated |
| Settings | Latest Wins | Most recent timestamp takes priority |
| Activity logs | Chronological Merge | All entries, sorted by date |
| Skills | Latest Version | Most recently modified version wins |
| CLAUDE.md | Ask User | Shows diff, lets you choose |

### Selective Sync

Don't want to sync everything? Pick what matters:

```bash
claude-sync config --include memory,skills --exclude settings
```

### Device Registry

See all your machines at a glance:

```bash
claude-sync devices

  Desktop-Home   (this device)
    OS: macOS  |  Last sync: 2 min ago  |  Last seen: just now

  MacBook-Pro
    OS: macOS  |  Last sync: 1 hour ago  |  Last seen: 1 hour ago

  Work-PC
    OS: Linux  |  Last sync: yesterday  |  Last seen: yesterday
```

### Sync Status

Always know where you stand:

```bash
claude-sync status

  Connected via git
  Device:     MacBook-Pro
  Last sync:  2 min ago
  Everything is up to date.
```

Or get a compact status for shell prompts:

```bash
claude-sync status --short
# [synced]
# [2 changes pending]
# [3 updates available]
```

### Auto-Sync on Session Start/End

Claude Code session starts? Pull the latest. Session ends? Push your changes. No manual intervention.

```bash
# Enable (default)
claude-sync config --auto-sync

# Disable
claude-sync config --no-auto-sync
```

### Encryption at Rest

Optionally encrypt your `.claude/` contents before syncing. Uses [age](https://age-encryption.org) encryption.

```bash
claude-sync config --encrypt
```

Your memory files are encrypted in the sync target. Only your devices can read them.

### Backup & History

Every sync creates a snapshot. Roll back to any point in time:

```bash
claude-sync history
  a1b2c3  Mar 15, 2025, 10:30 AM  (2 days ago)
    42 files, 1.2 MB — from Desktop-Home

claude-sync restore a1b2c3
```

### Works with claude-cortex

If you use [claude-cortex](https://github.com/anthropics/claude-cortex) for enhanced memory, claude-sync handles the sync automatically. They're designed to complement each other:

- **claude-cortex** = better memory *on one device*
- **claude-sync** = same memory *across all devices*

---

## Sync Backends

| Backend | Privacy | Speed | Setup | Best For |
|---------|---------|-------|-------|----------|
| **Git** | Medium | Fast | Easy | Developers who want version history |
| **iCloud/Dropbox/OneDrive** | Low | Automatic | Easiest | Non-technical users, "just works" |
| **Syncthing** | Maximum | Real-time | Medium | Privacy-focused, no cloud |
| **rsync/SSH** | Maximum | On-demand | Advanced | Server admins, direct sync |
| **Custom** | Varies | Varies | Flexible | Existing sync infrastructure |

### Git (Recommended)

Auto-commits and pushes `.claude/` to a private repo. Best balance of version history, speed, and portability.

```bash
claude-sync init --backend git --remote-url git@github.com:you/claude-sync-data.git
```

### Cloud Storage

Syncs via Dropbox, iCloud, or OneDrive. Auto-detects your cloud folder.

```bash
claude-sync init --backend cloud --cloud-provider icloud
```

### Syncthing

P2P sync between your devices. No cloud, no third party. Maximum privacy.

```bash
claude-sync init --backend syncthing
```

### rsync over SSH

Direct machine-to-machine sync. For users who already have SSH set up.

```bash
claude-sync init --backend rsync --rsync-target me@server:~/.claude-sync-data
```

### Custom

Bring your own sync command. Use `{path}` as a placeholder for the `.claude/` path.

```bash
claude-sync init --backend custom \
  --push-cmd "rclone sync {path} remote:claude-backup" \
  --pull-cmd "rclone sync remote:claude-backup {path}"
```

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `claude-sync init` | Interactive setup wizard |
| `claude-sync sync` | Manual sync (push + pull) |
| `claude-sync sync --push` | Push local changes only |
| `claude-sync sync --pull` | Pull remote changes only |
| `claude-sync sync --dry-run` | Show what would change |
| `claude-sync status` | Show sync status |
| `claude-sync status --short` | Compact status (for prompts) |
| `claude-sync devices` | List connected devices |
| `claude-sync devices --remove <id>` | Remove a device |
| `claude-sync config` | View configuration |
| `claude-sync config --include <patterns>` | Set include patterns |
| `claude-sync config --exclude <patterns>` | Set exclude patterns |
| `claude-sync config --encrypt` | Enable encryption |
| `claude-sync config --auto-sync` | Enable auto-sync |
| `claude-sync history` | View snapshots |
| `claude-sync history --prune 20` | Keep only 20 most recent |
| `claude-sync restore <id>` | Restore from snapshot |

---

## How It Works

```
Your Devices                    Sync Target
                               (Git repo / Cloud / P2P)

 Desktop        push
 ~/.claude/ ──────────────>  ┌──────────────────┐
                             │                  │
 Laptop         pull         │   Shared State   │
 ~/.claude/ <──────────────  │                  │
                             │  memory/         │
 Work PC        push/pull    │  skills/         │
 ~/.claude/ <─────────────>  │  settings/       │
                             │  projects/       │
                             └──────────────────┘
```

1. **Session starts** on any device: claude-sync pulls the latest state
2. **You work** with Claude Code. Memory, skills, context accumulate in `.claude/`
3. **Session ends**: claude-sync pushes your changes
4. **Switch devices**: Step 1 again. Claude knows everything.

Smart conflict resolution handles the edge cases when two devices edit simultaneously.

---

## Configuration

Configuration is stored in `~/.claude-sync/config.json`:

```json
{
  "version": 1,
  "deviceId": "a1b2c3d4e5f6",
  "deviceName": "MacBook-Pro",
  "backend": {
    "type": "git",
    "remoteUrl": "git@github.com:you/claude-sync-data.git",
    "branch": "main"
  },
  "encryption": {
    "enabled": false
  },
  "autoSync": {
    "onSessionStart": true,
    "onSessionEnd": true,
    "watchEnabled": true,
    "watchDebounceMs": 2000
  },
  "selective": {
    "mode": "all",
    "include": [],
    "exclude": []
  }
}
```

---

## Security

- **Encryption at rest**: Optional age encryption for all synced files
- **No telemetry**: Zero data collection, zero phone-home
- **Your data stays yours**: All backends are self-hosted or under your control
- **SSH key auth**: rsync backend uses SSH keys, never passwords
- **Private repos**: Git backend works with private repos only

See [docs/security.md](docs/security.md) for details.

---

## Requirements

- **Node.js** >= 18
- **Git** (for git backend)
- **rsync** (for rsync backend)
- **Syncthing** (for syncthing backend)
- **age** (for encryption — `brew install age` / `apt install age`)

---

## Related Projects

- **[claude-cortex](https://github.com/renefichtmueller/claude-cortex)** — Structured persistent memory for Claude Code. The knowledge that claude-sync distributes.
- **[slop-radar](https://github.com/renefichtmueller/slop-radar)** — AI slop detection. 245 English + 127 German phrases. CLI + Claude Code skill.

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT. See [LICENSE](LICENSE).

---

<div align="center">

**If claude-sync helps you vibe across devices, give it a star!**

Built for vibecoders who refuse to repeat themselves.

</div>
