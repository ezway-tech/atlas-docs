# Changelog

## 5.3.0

### Features

- npm CLI default listen port is **17430**. When `--port` is omitted and that port is busy, the CLI tries **17431–17439**, then exits if none are free.
- With `--port`, a busy port is an error (no auto-fallback). The Ready line prints the URL in use; the browser opens after the server is ready.
- Docker Hub Compose maps `127.0.0.1:17430:3000` by default. Override the host port with `ATLAS_DOCS_PORT`. Container listen port stays **3000**.

### Compatibility

- Source checkout (`npm run dev`) and source Compose still default to http://127.0.0.1:3000.
- Existing bookmarks to the previous npm/Docker Hub default URL on port **3000** need the new port, `--port 3000`, or `ATLAS_DOCS_PORT=3000`.

## 5.2.1

### Fixes

- Library lock treats a lock from another host/container as stale, and on Linux compares `/proc/<pid>/starttime` so Docker recreate (often PID 1 reuse) does not block reopening the same volume after a hard stop.

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
- Docker image defaults `ATLAS_DOCS_UPGRADE_BACKUP_DIR=/upgrade-backups` so schema-upgrade backups stay outside `/data` and can use a persistent volume. End-user Compose file: `docker-compose.hub.yml` (`ezwaytechvn/atlas-docs`).
- Set `ATLAS_DOCS_UPGRADE_BACKUP_DIR` for npm CLI, source bootstrap, and the server when you need a custom upgrade-backup parent directory.
