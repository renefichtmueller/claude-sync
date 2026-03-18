/**
 * Interactive init wizard — sets up claude-sync on this device
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { detectEnvironment, suggestBackend } from '../core/detector.js';
import { DeviceRegistry } from '../core/device-registry.js';
import { Encryption } from '../core/encryption.js';
import { GitBackend } from '../backends/git.js';
import { CloudBackend } from '../backends/dropbox.js';
import { SyncthingBackend } from '../backends/syncthing.js';
import { RsyncBackend } from '../backends/rsync.js';
import { CustomBackend } from '../backends/custom.js';
import { CONFIG_DIR, CONFIG_FILE } from '../types.js';
import type { SyncConfig, BackendConfig, BackendType, CloudProvider } from '../types.js';

interface InitOptions {
  backend?: string;
  deviceName?: string;
  remoteUrl?: string;
  cloudProvider?: string;
  cloudPath?: string;
  rsyncTarget?: string;
  sshKey?: string;
  pushCmd?: string;
  pullCmd?: string;
  encrypt?: boolean;
  autoSync?: boolean;
  watch?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  console.log('');
  console.log(chalk.cyan.bold('  claude-sync setup'));
  console.log(chalk.dim('  Sync your Claude Code memory across all your devices'));
  console.log('');

  // Detect environment
  const env = await detectEnvironment();
  const suggestions = suggestBackend(env);

  // Check if already initialized
  const configDir = path.join(os.homedir(), CONFIG_DIR);
  const configFile = path.join(configDir, CONFIG_FILE);
  let existingConfig = false;

  try {
    await fs.access(configFile);
    existingConfig = true;
  } catch {
    // Not initialized yet
  }

  if (existingConfig) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'claude-sync is already configured on this device. Reconfigure?',
      default: false,
    }]);

    if (!overwrite) {
      console.log(chalk.dim('  Setup cancelled.'));
      return;
    }
  }

  // Check if .claude/ exists
  if (!(await pathExists(env.claudeDir))) {
    console.log(chalk.yellow('  Note: ~/.claude/ directory not found.'));
    console.log(chalk.dim('  It will be created when Claude Code runs for the first time.'));
    console.log('');
  }

  // ── Device Name ──────────────────────────────────────────────

  const { deviceName } = options.deviceName
    ? { deviceName: options.deviceName }
    : await inquirer.prompt([{
        type: 'input',
        name: 'deviceName',
        message: "What's this device's name?",
        default: os.hostname(),
      }]);

  // ── Backend Selection ────────────────────────────────────────

  let backendType: BackendType;

  if (options.backend) {
    backendType = options.backend as BackendType;
  } else {
    const backendChoices = [];

    if (suggestions.includes('git')) {
      backendChoices.push({
        name: `${chalk.green('Git')} ${chalk.dim('(recommended)')} — version history, works everywhere`,
        value: 'git',
      });
    }

    if (suggestions.includes('cloud')) {
      const providers = env.cloudStoragePaths.filter(c => c.exists).map(c => c.provider);
      backendChoices.push({
        name: `${chalk.blue('iCloud / Dropbox / OneDrive')} — just works ${chalk.dim(`(detected: ${providers.join(', ') || 'none'})`)}`,
        value: 'cloud',
      });
    }

    if (suggestions.includes('syncthing')) {
      backendChoices.push({
        name: `${chalk.magenta('Syncthing')} — P2P, maximum privacy`,
        value: 'syncthing',
      });
    }

    if (suggestions.includes('rsync')) {
      backendChoices.push({
        name: `${chalk.yellow('rsync over SSH')} — advanced, direct machine-to-machine`,
        value: 'rsync',
      });
    }

    backendChoices.push({
      name: `${chalk.dim('Custom command')} — bring your own sync`,
      value: 'custom',
    });

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'backend',
      message: 'How do you want to sync?',
      choices: backendChoices,
    }]);

    backendType = answer.backend;
  }

  // ── Backend-specific Configuration ───────────────────────────

  const backendConfig: BackendConfig = { type: backendType };

  switch (backendType) {
    case 'git': {
      const { remoteUrl } = options.remoteUrl
        ? { remoteUrl: options.remoteUrl }
        : await inquirer.prompt([{
            type: 'input',
            name: 'remoteUrl',
            message: 'Git remote URL (leave empty for local-only):',
            default: '',
          }]);
      backendConfig.remoteUrl = remoteUrl;
      backendConfig.branch = 'main';
      break;
    }

    case 'cloud': {
      const availableClouds = env.cloudStoragePaths.filter(c => c.exists);
      let provider: CloudProvider;
      let cloudPath: string;

      if (options.cloudProvider) {
        provider = options.cloudProvider as CloudProvider;
        cloudPath = options.cloudPath ?? availableClouds.find(c => c.provider === provider)?.path ?? '';
      } else if (availableClouds.length === 1) {
        provider = availableClouds[0].provider;
        cloudPath = availableClouds[0].path;
        console.log(chalk.dim(`  Auto-detected: ${provider} at ${cloudPath}`));
      } else if (availableClouds.length > 1) {
        const answer = await inquirer.prompt([{
          type: 'list',
          name: 'provider',
          message: 'Which cloud storage?',
          choices: availableClouds.map(c => ({
            name: `${c.provider} (${c.path})`,
            value: c.provider,
          })),
        }]);
        provider = answer.provider;
        cloudPath = availableClouds.find(c => c.provider === provider)?.path ?? '';
      } else {
        const answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'provider',
            message: 'Which cloud provider?',
            choices: ['dropbox', 'icloud', 'onedrive'],
          },
          {
            type: 'input',
            name: 'cloudPath',
            message: 'Path to cloud storage folder:',
          },
        ]);
        provider = answer.provider;
        cloudPath = answer.cloudPath;
      }

      backendConfig.cloudProvider = provider;
      backendConfig.cloudPath = cloudPath;
      break;
    }

    case 'syncthing': {
      // Syncthing auto-detects most settings
      break;
    }

    case 'rsync': {
      const { rsyncTarget } = options.rsyncTarget
        ? { rsyncTarget: options.rsyncTarget }
        : await inquirer.prompt([{
            type: 'input',
            name: 'rsyncTarget',
            message: 'rsync target (user@host:/path):',
          }]);

      backendConfig.rsyncTarget = rsyncTarget;
      backendConfig.sshKeyPath = options.sshKey;
      break;
    }

    case 'custom': {
      let pushCmd: string;
      let pullCmd: string;

      if (options.pushCmd && options.pullCmd) {
        pushCmd = options.pushCmd;
        pullCmd = options.pullCmd;
      } else {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'pushCmd',
            message: 'Push command (use {path} for .claude/ path):',
          },
          {
            type: 'input',
            name: 'pullCmd',
            message: 'Pull command (use {path} for .claude/ path):',
          },
          {
            type: 'input',
            name: 'statusCmd',
            message: 'Status command (optional):',
            default: '',
          },
        ]);
        pushCmd = answers.pushCmd;
        pullCmd = answers.pullCmd;
        backendConfig.statusCommand = answers.statusCmd || undefined;
      }

      backendConfig.pushCommand = pushCmd;
      backendConfig.pullCommand = pullCmd;
      break;
    }
  }

  // ── Encryption ───────────────────────────────────────────────

  let encryptionEnabled = options.encrypt ?? false;

  if (options.encrypt === undefined) {
    const { encrypt } = await inquirer.prompt([{
      type: 'confirm',
      name: 'encrypt',
      message: 'Enable encryption at rest?',
      default: false,
    }]);
    encryptionEnabled = encrypt;
  }

  let encryptionConfig = { enabled: false } as { enabled: boolean; identityFile?: string; recipientKey?: string };

  if (encryptionEnabled) {
    if (!env.hasAge) {
      console.log(chalk.yellow('  age encryption tool not found. Install it:'));
      console.log(chalk.dim('    macOS:   brew install age'));
      console.log(chalk.dim('    Linux:   apt install age'));
      console.log(chalk.dim('    Windows: scoop install age'));
      console.log('');

      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Continue without encryption?',
        default: true,
      }]);

      if (!proceed) {
        console.log(chalk.dim('  Install age and run claude-sync init again.'));
        return;
      }
    } else {
      console.log(chalk.dim('  Generating encryption keypair...'));
      const encryption = new Encryption({ enabled: true });
      const { identityFile, publicKey } = await encryption.generateKeypair();
      encryptionConfig = {
        enabled: true,
        identityFile,
        recipientKey: publicKey,
      };
      console.log(chalk.green(`  Keypair generated. Identity: ${identityFile}`));
    }
  }

  // ── Auto-sync ────────────────────────────────────────────────

  let autoSyncEnabled = options.autoSync ?? true;
  let watchEnabled = options.watch ?? true;

  if (options.autoSync === undefined) {
    const { autoSync } = await inquirer.prompt([{
      type: 'confirm',
      name: 'autoSync',
      message: 'Auto-sync on session start/end?',
      default: true,
    }]);
    autoSyncEnabled = autoSync;
  }

  if (options.watch === undefined && autoSyncEnabled) {
    const { watch } = await inquirer.prompt([{
      type: 'confirm',
      name: 'watch',
      message: 'Watch for changes in real-time?',
      default: true,
    }]);
    watchEnabled = watch;
  }

  // ── Save Configuration ───────────────────────────────────────

  const registry = new DeviceRegistry();
  const device = registry.getCurrentDevice(deviceName);

  const config: SyncConfig = {
    version: 1,
    deviceId: device.id,
    deviceName,
    backend: backendConfig,
    encryption: encryptionConfig,
    autoSync: {
      onSessionStart: autoSyncEnabled,
      onSessionEnd: autoSyncEnabled,
      watchEnabled,
      watchDebounceMs: 2000,
    },
    selective: {
      mode: 'all',
      include: [],
      exclude: [],
    },
    hooks: {},
  };

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), 'utf-8');

  // Register this device
  await registry.registerDevice(device);

  // ── Initialize Backend ───────────────────────────────────────

  console.log('');
  console.log(chalk.dim('  Initializing sync backend...'));

  try {
    const backend = createBackend(backendConfig);
    await backend.init(backendConfig);
    console.log(chalk.green('  Backend initialized.'));
  } catch (err) {
    console.log(chalk.yellow(`  Backend setup warning: ${(err as Error).message}`));
    console.log(chalk.dim('  You may need to complete setup manually.'));
  }

  // ── Success ──────────────────────────────────────────────────

  console.log('');
  console.log(chalk.green.bold('  Setup complete!'));
  console.log('');
  console.log(`  ${chalk.dim('Device:')}     ${deviceName}`);
  console.log(`  ${chalk.dim('Backend:')}    ${formatBackend(backendConfig)}`);
  console.log(`  ${chalk.dim('Encryption:')} ${encryptionConfig.enabled ? 'on' : 'off'}`);
  console.log(`  ${chalk.dim('Auto-sync:')}  ${autoSyncEnabled ? 'enabled' : 'disabled'}`);
  console.log(`  ${chalk.dim('Watcher:')}    ${watchEnabled ? 'enabled' : 'disabled'}`);
  console.log('');
  console.log(chalk.dim("  Run 'claude-sync status' to check sync state."));
  console.log(chalk.dim("  Run 'claude-sync sync' to sync now."));
  console.log('');
}

function createBackend(config: BackendConfig) {
  switch (config.type) {
    case 'git': return new GitBackend(config);
    case 'cloud': return new CloudBackend(config);
    case 'syncthing': return new SyncthingBackend(config);
    case 'rsync': return new RsyncBackend(config);
    case 'custom': return new CustomBackend(config);
    default: throw new Error(`Unknown backend: ${config.type}`);
  }
}

function formatBackend(config: BackendConfig): string {
  switch (config.type) {
    case 'git':
      return config.remoteUrl ? `git (${config.remoteUrl})` : 'git (local)';
    case 'cloud':
      return `${config.cloudProvider} (${config.cloudPath})`;
    case 'syncthing':
      return 'syncthing (P2P)';
    case 'rsync':
      return `rsync (${config.rsyncTarget})`;
    case 'custom':
      return 'custom command';
    default:
      return config.type;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
