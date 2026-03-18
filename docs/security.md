# Security & Privacy

claude-sync takes security seriously. Your Claude Code memory may contain project details, preferences, and other sensitive context.

## Principles

1. **Your data stays yours.** No telemetry, no analytics, no phone-home.
2. **You choose where data goes.** All backends are self-hosted or under your control.
3. **Encryption is optional but encouraged.** Especially for cloud-based backends.
4. **Minimal permissions.** claude-sync only reads/writes `~/.claude/` and `~/.claude-sync/`.

## Encryption at Rest

claude-sync supports optional encryption using [age](https://age-encryption.org), a modern file encryption tool.

### How It Works

1. During `claude-sync init`, choose to enable encryption.
2. claude-sync generates an age keypair stored at `~/.claude-sync/age-identity.txt`.
3. Before pushing, all files are encrypted with your public key.
4. After pulling, files are decrypted with your private key.
5. Only your devices (with the identity file) can decrypt the data.

### Enabling Encryption

```bash
# During init
claude-sync init --encrypt

# After init
claude-sync config --encrypt
```

### Key Management

- **Identity file**: `~/.claude-sync/age-identity.txt` (private key)
- **Permissions**: Automatically set to `0600` (owner read/write only)
- **Sharing**: Copy the identity file to each device that needs to decrypt

> **Important**: Back up your identity file. If you lose it, you cannot decrypt your synced data.

### What Gets Encrypted

When encryption is enabled, ALL files synced through claude-sync are encrypted:
- Memory files (`.md`)
- Settings (`.json`)
- Skills
- Activity logs
- Project configurations

### What Is NOT Encrypted

- The `~/.claude-sync/config.json` file (contains no sensitive content data)
- The device registry (`devices.json`)
- Snapshot manifests

## Backend-Specific Security

### Git

- Use a **private** repository
- Use **SSH key authentication** (not HTTPS with stored passwords)
- Consider a dedicated repo that only claude-sync accesses
- Enable encryption if using a hosted service (GitHub, GitLab)

### Cloud Storage

- Files are stored in your cloud provider's infrastructure
- Subject to your cloud provider's privacy policy
- **Strongly recommend enabling encryption** for this backend
- The `claude-sync/` subfolder is created in your cloud storage root

### Syncthing

- Data never leaves your devices (P2P)
- Uses TLS encryption in transit
- No cloud, no third-party access
- Encryption at rest is optional but adds an extra layer

### rsync/SSH

- Data travels over encrypted SSH connections
- Stored on the remote machine you control
- Use SSH key authentication (never passwords)
- Encryption at rest protects against remote machine compromise

## File Permissions

claude-sync respects file permissions:

- Config files: `0644`
- Identity (encryption key): `0600`
- Snapshot directories: `0755`

## Lock Files

During sync operations, a lock file (`~/.claude-sync/.claude-sync.lock`) prevents concurrent syncs that could corrupt data.

## Snapshot Safety

Before every pull operation, claude-sync creates a local snapshot. If a sync goes wrong, you can always restore:

```bash
claude-sync history
claude-sync restore <snapshot-id>
```

## Reporting Issues

If you find a security issue, please report it responsibly. Open an issue on GitHub or contact the maintainers directly.
