# Troubleshooting

## Common Issues

### "claude-sync is not configured on this device"

You need to run the init wizard first:

```bash
claude-sync init
```

### "Git repo not initialized"

The git backend needs a repo. Either:
1. Re-run `claude-sync init` with a remote URL
2. Or manually init: `git init ~/.claude-sync/repo`

### "Cannot connect via SSH" (rsync backend)

Verify SSH works independently:

```bash
ssh user@host echo ok
```

Common fixes:
- Ensure your SSH key is added to the agent: `ssh-add ~/.ssh/id_ed25519`
- Verify the host is in `~/.ssh/known_hosts`
- Check that `BatchMode=yes` doesn't interfere (test without it first)

### "Syncthing is not running"

Start Syncthing:
- **macOS**: `brew services start syncthing`
- **Linux**: `systemctl --user start syncthing`
- **Windows**: Start from the Start Menu

### "Push failed: needs pull first" (Git)

Another device pushed changes. Pull first:

```bash
claude-sync sync --pull
claude-sync sync --push
```

Or just:

```bash
claude-sync sync
```

This does both pull and push in the correct order.

### "Another sync is in progress"

A lock file exists at `~/.claude-sync/.claude-sync.lock`. This happens if a previous sync was interrupted.

If no sync is actually running, remove it:

```bash
rm ~/.claude-sync/.claude-sync.lock
```

### Conflicts in CLAUDE.md

CLAUDE.md conflicts use the "ask-user" strategy and cannot be auto-resolved. The file stays at its local version. To resolve:

1. Run `claude-sync sync --pull`
2. Check the conflict message
3. Manually edit `~/.claude/CLAUDE.md`
4. Run `claude-sync sync --push`

### Cloud storage not detected

If claude-sync can't find your cloud folder:

```bash
claude-sync init --backend cloud --cloud-provider dropbox --cloud-path /path/to/Dropbox
```

### Encryption key not found

If you see "age identity not found":
1. Check that `~/.claude-sync/age-identity.txt` exists
2. Copy it from the device where you first ran `claude-sync init --encrypt`

### Slow sync

- **Git**: Check your network connection to the remote
- **Cloud**: Cloud providers sync in the background; files may take a few minutes
- **Syncthing**: Ensure both devices are online and paired
- **rsync**: Large diffs take longer; first sync is always the slowest

## Getting Help

1. Check `claude-sync status` for diagnostics
2. Run commands with `--json` for machine-readable output
3. Open an issue on GitHub with:
   - Your OS and Node.js version
   - Backend type
   - The error message
   - Output of `claude-sync status --json`
