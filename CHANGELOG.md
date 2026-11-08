# Changelog

## 5.2.0

### Compatibility

- Introduces library `schemaVersion` in `db.json`. Current schema is **1**.
- Existing libraries without `schemaVersion` are treated as **legacy** and migrate to schema 1 on confirmed start (`--yes` or interactive prompt). Migration creates a full filesystem backup outside the library first.
- Libraries with a newer schema than this app are refused; data and agent guides are not modified.
- ZIP backup format version remains **1** (archive format). Schema compatibility is read from `db.json`, not from the ZIP format field.
- Requires Node.js **>= 22.12.0**.

### Features

- Shared `core/` library checks used by the npm CLI, source bootstrap, and server runtime.
- Cross-process library lock (`.atlas-docs.lock`) with heartbeat and verified stale recovery.
- CLI commands: `start` (default), `library use|info`, `doctor`, `update` / `update --check`.
- Project config `atlas-docs.config.json` for remembered library paths.
- Background update notice (24h cache; disabled in CI / `ATLAS_DOCS_NO_UPDATE_CHECK`); UI banner with copyable command (no package-manager HTTP API).
- Structured agent-kit composition for npm packages.

### Recovery

- Interrupted schema migration uses `.atlas-migrate-journal.json` and the upgrade backup directory.
- Recovery restores the **full** upgrade-backup tree (not only `db.json`), then clears the journal; the backup directory is kept.
- Do not roll back by only installing an older app when the schema already advanced; restore the pre-upgrade backup instead.
- Cross-artifact upgrade from the pinned `scripts/fixtures/atlas-docs-5.1.0.tgz` fixture is exercised by `npm run test:upgrade-artifacts` (fails if the fixture or checksum is missing), including real process aborts at migrate checkpoints and CLI `--yes` resume.
- `ATLAS_TEST_MIGRATE_ABORT` is a **test-only** hook (`after-backup` | `after-journal` | `after-data` | `before-complete`) that exits with code 97; production and normal CLI never set it.

### Note on 5.1.0

Version 5.1.0 cannot enforce schema checks or cross-process locks. Protection starts when a 5.2.0+ app opens the library.

### Packaging

- Release tarball includes `bin/`, `core/`, `runtime/`, `agent-kit/`, and a `.sha256` checksum file beside the `.tgz`.
