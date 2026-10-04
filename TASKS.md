# Tasks

## 1.1.0 security and correctness release

| Field | Value |
|---|---|
| Status | Complete |
| Priority | Critical |
| Task | Stop secrets from being synced, close the sync-to-code-execution path, fix data loss/deletions/conflicts in the git backends, fix the gitea crash, make docs match behaviour, repair CI. |
| Acceptance criterion | Never-synced list enforced in all backends; settings.json/plugins changes held; git/gitea sync passes the multi-device scenarios (concurrent edits, deletions, conflicts, new device, legacy credential purge, union merge); CI green on Node 18-24; README/docs claim only implemented features. |
| Evidence | 2026-10-04: independent security and functional reviews; 48 unit/integration tests pass locally (vitest, real git with a bare remote and two simulated devices); end-to-end CLI run with two temporary HOME directories (init via flags, sync, held settings.json, accept-incoming, conflict, --prefer remote, status, hooks). Second independent review: credential redaction, case-insensitive matching and a held-file guard added. PR #1 merged as `f3eb98b` with CI green on Node 18/20/22/24 and secret-scan; GitHub release v1.1.0 published. |
| Blocker | None. |
| Next step | Maintainer decisions: GitHub security advisory for users of earlier versions; npm scoped name. |
| Continuation context | Core: `src/core/sync-filter.ts` (never-synced list, held files), `src/backends/git-sync.ts` (shared engine for git and gitea). The npm name `claude-sync` belongs to an unrelated package; install is from GitHub until a scoped name is chosen. |

## Open follow-ups

| Field | Value |
|---|---|
| Status | Open |
| Priority | Medium |
| Task | Encryption at rest (age, wired into push/pull); real-time file watcher daemon; merge semantics for the experimental backends; npm publication under a scoped name; Gitea token via credential helper instead of the clone URL. |
| Acceptance criterion | Each item implemented with tests and documented, or explicitly dropped from the README. |
| Evidence | Identified in the 2026-10-04 reviews. |
| Blocker | Scope decisions by the maintainer. |
| Next step | Prioritise; encryption first if hosted remotes are a target use case. |
| Continuation context | `src/core/encryption.ts` already wraps the age CLI; `src/core/watcher.ts` exists but nothing starts it; `src/core/merger.ts` is unused by the sync path. |
