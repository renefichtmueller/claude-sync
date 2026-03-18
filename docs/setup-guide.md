# Setup Guide

Detailed setup instructions for each sync backend.

## Prerequisites

- Node.js >= 18
- Claude Code installed and working (so `~/.claude/` exists)

## Interactive Setup

The fastest way to get started:

```bash
npm install -g claude-sync
claude-sync init
```

The wizard detects your OS, available tools, and cloud storage to suggest the best option.

## Git Backend

Best for developers. Provides full version history and works on any platform.

### Setup

1. Create a **private** Git repository (GitHub, GitLab, Bitbucket, Gitea, etc.)
2. Run:

```bash
claude-sync init --backend git --remote-url git@github.com:you/claude-sync-data.git
```

### Requirements

- `git` installed and on your PATH
- SSH key configured for the remote (or HTTPS credentials cached)

### How It Works

claude-sync maintains a local git repo at `~/.claude-sync/repo/`. On push, it copies `.claude/` contents into this repo, commits, and pushes. On pull, it fetches, merges, and copies back to `.claude/`.

### Tips

- Use a **private** repo. Your Claude memory may contain project details.
- The repo only stores `.claude/` contents, not your actual code.
- Every push creates a commit, so you get full history for free.

## Cloud Storage (Dropbox / iCloud / OneDrive)

Easiest setup. If you already have cloud storage, there's almost nothing to configure.

### Setup

```bash
# Auto-detect cloud provider
claude-sync init --backend cloud

# Or specify
claude-sync init --backend cloud --cloud-provider dropbox
claude-sync init --backend cloud --cloud-provider icloud
claude-sync init --backend cloud --cloud-provider onedrive
```

### Requirements

- Cloud storage app installed and syncing
- Default paths:
  - **Dropbox**: `~/Dropbox/`
  - **iCloud**: `~/Library/Mobile Documents/com~apple~CloudDocs/`
  - **OneDrive**: `~/OneDrive/`

### How It Works

claude-sync creates a `claude-sync/` subfolder in your cloud storage and copies `.claude/` contents there. The cloud provider handles replication.

### Tips

- Sync speed depends on your cloud provider.
- Large files may take a moment to propagate.
- Works on any platform where the cloud app is installed.

## Syncthing Backend

Maximum privacy. P2P sync between your devices, no cloud involved.

### Setup

1. Install Syncthing on all devices: https://syncthing.net
2. Start Syncthing and ensure it's running
3. Run:

```bash
claude-sync init --backend syncthing
```

4. In the Syncthing UI, share the `claude-sync` folder with your other devices

### Requirements

- Syncthing installed and running
- Devices must be paired in Syncthing

### How It Works

claude-sync creates a directory at `~/.claude-sync/syncthing-data/` and registers it as a Syncthing shared folder. Syncthing handles real-time P2P sync.

### Tips

- Best for real-time sync between devices on the same network.
- Also works over the internet (Syncthing uses relay servers for NAT traversal).
- No data ever touches a third-party server.

## rsync over SSH

Direct machine-to-machine sync. For users who already have SSH infrastructure.

### Setup

1. Ensure SSH key auth works between your machines
2. Run:

```bash
claude-sync init --backend rsync --rsync-target user@host:~/.claude-sync-data
```

### Requirements

- `rsync` installed on both machines
- SSH key authentication set up (no password prompts)

### How It Works

Uses `rsync -avz --delete` to synchronize `.claude/` contents to/from the remote machine.

### Tips

- One-directional by default (push or pull). Run `claude-sync sync` for bidirectional.
- Works great for syncing to/from a home server.
- You can use any SSH-accessible machine as the "hub."

## Custom Backend

For any sync tool not covered above — rclone, unison, resilio, etc.

### Setup

```bash
claude-sync init --backend custom \
  --push-cmd "rclone sync {path} remote:claude-backup" \
  --pull-cmd "rclone sync remote:claude-backup {path}"
```

### Placeholders

- `{path}` — the `.claude/` directory path
- `{home}` — user's home directory
- `{hostname}` — machine hostname

### Environment Variables

Your commands also receive:
- `CLAUDE_SYNC_SOURCE` — source path (on push)
- `CLAUDE_SYNC_TARGET` — target path (on pull)

## Multi-Device Setup

After setting up the first device, repeat on each additional device:

```bash
# On each new device:
npm install -g claude-sync
claude-sync init
```

Use the same backend and remote target on all devices. The device registry tracks all connected machines.

## Verifying Setup

After setup on all devices:

```bash
# Check status
claude-sync status

# List connected devices
claude-sync devices

# Do a manual sync
claude-sync sync
```
