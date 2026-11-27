# Changelog

## 6.2.2 — 2026-11-27

- Open folder tree and comment tips with the help buttons. Drag instructions no longer appear over rows, and truncated names use the shared tooltip.

## 6.2.1 — 2026-11-27

- Open existing document folders in the standard Atlas workspace. Markdown front matter supplies titles and ordering while the original documents and revision history stay in place.

- Update notice moves to a version chip beside the brand (no Help menu dot). **Skip this version** hides the highlight until a newer release; **What's new** opens the GitHub changelog. Bundled Help release notes remain the installed package changelog.

## 6.2.0 — 2026-11-27

- Open existing document folders in place, preview nested files and edit originals with conflict detection and revision history.

## 6.1.2 — 2026-11-27

- Open the selected project folder with the desktop file manager and report launcher errors. Hide this action in Docker and headless Linux sessions.
- Apply the saved theme before displaying Projects, the workspace, documents and Help.

## 6.1.1 — 2026-11-25

- Add npm search keywords for documentation, Markdown, OpenAPI, SQL, and local-first usage.

## 6.1.0 — 2026-11-20

- Browse for project asks for a display name when the folder is not already in the list (suggested from the folder name; focus selects the hint so you can type over it; Enter confirms). Empty folders use the same name step before initialize-in-place.
- Drag to reorder sibling folders and documents in the tree, right-panel tabs, sidebar section order and pinned folders, non-Example projects in Projects, and assets in Media.
- Folder titles without a `db.json` entry show the path basename as-is (no PascalCase rewrite).
- The data schema remains version 1. Existing compatible libraries remain supported.

## 6.0.0 — 2026-11-19

- All installations use Projects with one durable Example on first launch. Docker now shares npm/source startup and preserves Example edits and recent projects.
- **Breaking:** fixed-library launcher mode is removed. Remove DATA_DIR and ATLAS_LIBRARY_MODE=fixed from launch configuration. Standard Docker Compose persists /libraries, /atlas-registry, and /upgrade-backups; mount an old complete library under /libraries/<project> and open it from Projects. No data is automatically moved or deleted.
- Docker includes versioned agent instructions. Guides now show the complete library structure and require Atlas initialization before agents generate documents.
- The data schema remains version 1. Existing compatible libraries, uploads, comments, and history remain supported.


## 5.4.1

### Docs

- Richer npm package README and Docker Hub Overview: screenshots (absolute image URLs), badges, and clearer quick-start copy.
- Source of Hub Overview: [`guides/docker-hub-overview.md`](guides/docker-hub-overview.md); sync steps in [operations](guides/operations.md#update-docker-hub-overview).
- Schema remains **1**. No app behavior change from 5.4.0. Docker image tags stay on **5.4.0** / `latest` for this docs patch; only the Hub description is updated.

### Upgrade

- **npm:** install `atlas-docs@5.4.1` (or `npx atlas-docs@5.4.1`). Same library paths as 5.4.0.
- **Docker Hub:** keep using `ezwaytechvn/atlas-docs:5.4.0` (or `latest`). No image rebuild required for this patch.

## 5.4.0

### Fixes

- Local library APIs accept same-origin Chromium GETs without `Origin` (still require local Host, reject cross-site, and require app headers).
- Path containment and library identity compare case-insensitively only on Windows; Linux keeps case.
- Docker multi-library manager ignores the image default `DATA_DIR=/data` when that path is not the selected library.
- Managed runtimes require matching session headers on library manage routes and on data GETs; stale tabs stay disconnected.
- Opening Libraries prompts when the workspace has unsaved drafts; child shutdown drains in-flight library writes before exit.
- Supervisor prints Ready and updates recent only after `GET /api/libraries/ready` confirms the library lock (or manager mode).
- Use for this project writes config only under `ATLAS_LAUNCH_CWD` (browser cannot supply another cwd).
- Media bytes (`GET /api/media/{id}`) require matching `rt`/`lib` query (or session headers); the UI stamps those onto each media URL so tabs/ports do not share a hostname cookie.
- Visual Editor stamps `rt`/`lib` on image `src` when TipTap renders the DOM; Markdown on disk stays bare so session ids are not persisted across runs.
- Library switch drains admitted writes first with a real timeout; if drain fails the switch is cancelled and the current runtime stays up (`cancelShutdown`).
- After a library switch, the UI waits for a new `runtimeId`, exact `libraryId`, and `/api/libraries/ready` (no case-folding or path `endsWith` guesses).

### Features

- Multi-library management for the npm CLI: open, create, rename display names, remove from recent, and try the Little Café demo from the UI without rewriting project config.
- Machine-local recent library registry (Windows `LOCALAPPDATA/atlas-docs`, Linux XDG config; override with `ATLAS_DOCS_REGISTRY_DIR`). Recent entries are outside library folders and never delete library data.
- Library selection order: `--data-dir` → `DATA_DIR` → `atlas-docs.config.json` → valid recent → existing `./atlas-docs-data` compatibility → Projects screen (no automatic empty library).
- Managed runtime supervisor switches libraries by starting a new child with a fixed `DATA_DIR` (same pattern as Update and restart). Stale tabs are rejected with runtime/library session headers.
- Source checkout home redirects to `/projects`; workspace stays on `/workspace` and document links. Managed source opens a valid recent project or the durable Example project; an existing repository `data/` library stays listed and is not replaced.
- Docker: keep single-library `/data` Compose; add opt-in multi-library Compose examples with `/libraries` + `/atlas-registry` and in-container switch without restarting the container.
- Folder browser APIs stay local-only with origin/host checks and server-side allowed roots (canonical containment).

### Compatibility

- Running `atlas-docs` with no library target no longer auto-creates `./atlas-docs-data`. Pass `--data-dir` / `DATA_DIR` for automation, or use the Projects UI. An existing openable `./atlas-docs-data` is still opened for upgrade compatibility.
- Project config paths on another Windows drive are stored absolute (never `./D:/...`).
- Source checkout is multi-project managed unless `DATA_DIR` or `ATLAS_LIBRARY_MODE=fixed` pins one library. Fixed Docker `/data` stays single-library; use multi-library Compose to switch projects in one container.
- Schema remains **1**. Opening a 5.3.0 library in 5.4.0 does not run a schema migration or create an upgrade backup.
- npm package includes `demo/` (seed script + Little Café) for Try demo / Example.

### Upgrade

- **npm:** stop the app, back up the library (or export a ZIP), install `atlas-docs@5.4.0` (or `npx atlas-docs@5.4.0`), then open the same absolute library path. See [npm updates](guides/npm.md#updates).
- **Docker Hub:** set `ATLAS_DOCS_VERSION=5.4.0` (or pull `ezwaytechvn/atlas-docs:5.4.0`), keep the same data and upgrade-backup volumes, recreate the container. Single-library and multi-library Compose files both work with the same image tag.
- Keep the library backup until you have checked documents, attachments, comments, and settings. Do not roll back only by installing an older package if a later schema migration already ran (not expected for 5.3.0 → 5.4.0).

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
