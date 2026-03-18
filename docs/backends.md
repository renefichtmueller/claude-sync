# Sync Backend Comparison

## Overview

| Feature | Git | Cloud Storage | Syncthing | rsync/SSH | Custom |
|---------|-----|---------------|-----------|-----------|--------|
| **Privacy** | Medium | Low | Maximum | Maximum | Varies |
| **Speed** | Fast | Automatic | Real-time | On-demand | Varies |
| **Setup** | Easy | Easiest | Medium | Advanced | Flexible |
| **Version History** | Full | None | None | None | Varies |
| **Conflict Handling** | Git merge | Last-write wins | Syncthing versioning | Last-write wins | Manual |
| **Offline Support** | Full | Partial | Full | None | Varies |
| **Cost** | Free | Free (if you have storage) | Free | Free | Varies |
| **Platforms** | All | macOS, Windows | All | macOS, Linux | All |

## When to Use Each

### Git — Best for Most Developers

Choose Git if you:
- Want full version history of every change
- Are comfortable with Git
- Want to use GitHub/GitLab for hosting
- Need to work offline frequently

### Cloud Storage — Best for Simplicity

Choose Dropbox/iCloud/OneDrive if you:
- Want zero configuration
- Already have cloud storage set up
- Don't need version history
- Work primarily on macOS or Windows

### Syncthing — Best for Privacy

Choose Syncthing if you:
- Don't want any data on third-party servers
- Want real-time sync between devices
- Are okay with a slightly more complex setup
- Have devices that are frequently on the same network

### rsync/SSH — Best for Control

Choose rsync if you:
- Have a home server or VPS
- Want maximum control over sync timing
- Already have SSH infrastructure
- Prefer explicit push/pull over automatic sync

### Custom — Best for Existing Infrastructure

Choose Custom if you:
- Already use rclone, unison, resilio, or similar
- Need integration with corporate sync tools
- Want full control over the sync commands

## Architecture

All backends implement the same interface:

```typescript
interface SyncBackend {
  init(config: BackendConfig): Promise<void>;
  push(sourcePath: string): Promise<SyncResult>;
  pull(targetPath: string): Promise<SyncResult>;
  status(): Promise<SyncStatus>;
  isAvailable(): Promise<boolean>;
}
```

This means backends are fully swappable. You can switch from Git to Syncthing at any time by running `claude-sync init` again.
