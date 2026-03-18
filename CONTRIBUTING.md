# Contributing to claude-sync

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/claude-sync/claude-sync.git
cd claude-sync

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run in watch mode during development
npm run dev
```

## Project Structure

```
src/
  cli/        CLI commands (init, sync, status, etc.)
  backends/   Sync backends (git, cloud, syncthing, rsync, custom)
  core/       Core functionality (merger, encryption, watcher, etc.)
  hooks/      Session lifecycle hooks
  types.ts    TypeScript type definitions
bin/          CLI entry point
tests/        Test files
docs/         Documentation
```

## How to Contribute

### Bug Reports

Open an issue with:
- Your OS, Node.js version, and claude-sync version
- Backend type you're using
- Steps to reproduce
- Expected vs actual behavior
- Output of `claude-sync status --json`

### Feature Requests

Open an issue describing:
- The use case (what are you trying to do?)
- Proposed solution
- Alternatives you've considered

### Pull Requests

1. Fork the repo and create a branch from `main`
2. Write your code
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Ensure TypeScript compiles: `npm run build`
6. Open a PR with a clear description

### Adding a New Backend

Backends follow the strategy pattern. To add a new backend:

1. Create a new file in `src/backends/`
2. Implement the `SyncBackend` interface from `src/types.ts`
3. Register it in `src/cli/helpers.ts` (`getBackend` function)
4. Add it to the init wizard in `src/cli/init.ts`
5. Add tests
6. Add documentation in `docs/`

### Code Style

- TypeScript strict mode
- No `any` types (except where absolutely necessary with a comment)
- Async/await over raw promises
- Descriptive variable names
- JSDoc comments for public APIs

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run a specific test file
npx vitest run tests/merger.test.ts
```

Tests that require external tools (git, age, rsync) are automatically skipped if the tool isn't installed.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
