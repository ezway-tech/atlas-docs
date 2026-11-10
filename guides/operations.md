# Operations guide

[Documentation home](../README.md) · [User guide](user-guide.md) · [Agent guide](agent-guide.md)

Commands below run from the Atlas Docs repository root unless stated otherwise. The interface supports five languages (vi, en, zh-Hans, es, ja). Pick one under **Utilities → Language**. Guides use English names for features; on-screen labels follow the selected language.
## Install and run

For the npm/npx distribution, use [Atlas Docs with npm](npm.md). The commands and default
paths below refer to a source checkout unless explicitly marked as npm CLI instructions.

Requires Node.js 22.12 or newer. From the repository root:

```powershell
npm run setup
npm run bootstrap
npm run dev
```

Open http://127.0.0.1:3000. Bootstrap uses the shared `core` prepare path: it creates an **empty** library when missing, and migrates a legacy library only when `ATLAS_DOCS_MIGRATE_YES=1` is set (the npm CLI can prompt or accept `--yes` instead). It also runs automatically before `npm run dev` and `npm start`. Repeating it does not replace existing user documents. For production, run `npm run build`, then `npm start`.

Libraries store `schemaVersion` in `db.json` (currently 1). Source and Docker still default to repository `data/` and `/data` respectively — not `atlas-docs-data`.

## Optional Little Café demo

With the app stopped, from the repository root:

```powershell
npm run seed:demo
npm run dev
```

Seeding validates the bundled sample, then copies it into an empty library. It refuses existing documents, folders, assets, comments, history, or unexpected files. There is no force/overwrite option. An empty database created by bootstrap is accepted. Do not seed while the app is running.

Start at **Start here → Welcome to Little Café → Explore Atlas Docs**. The 13 short documents cover Markdown, links, Mermaid, OpenAPI, SQL, YAML, and JSON. Five original media files demonstrate image previews, CSV download, audio, and video. A sample comment and two older recipe revisions demonstrate discussion and history. Menu starts pinned; Operations → Stock starts hidden and can be shown from the dashboard.

All content is fictional. The two café images were generated with OpenAI ImageGen in a photographic style; they do not depict a real café. The synthesized chime and animated diagram were created for this repository. Demo media is distributed with this repository under its MIT license. The ordering API is documentation only; no ordering backend is supplied. No external media downloads are needed to use the sample.

### Keep existing data and try the demo separately

`DATA_DIR` is supported by the app, bootstrap, and seeder. Use an absolute path outside the repository for a separate library. PowerShell example, from the repository root:

```powershell
$env:DATA_DIR = Join-Path $env:LOCALAPPDATA 'AtlasDocs/little-cafe-demo'
npm run seed:demo
npm run dev
```

Keep that variable set for subsequent commands using this library. Stop the app and run `Remove-Item Env:DATA_DIR` to return to the default `data/`. On macOS/Linux, use `export DATA_DIR="$HOME/.local/share/atlas-docs/little-cafe-demo"` and `unset DATA_DIR` respectively. Root scripts execute inside `app/`, so relative `DATA_DIR` values resolve from `app/`; absolute paths are recommended.

To reset a demo, use another empty directory. Do not delete a working library just to load the sample. Source files under `examples/` are committed; UI edits affect only the selected data directory.

Demo updates do not migrate an already seeded library. To see the latest sample, stop the app, set `DATA_DIR` to a new empty directory (for example `AtlasDocs/little-cafe-demo-v2` under your local application-data directory), then run `npm run seed:demo` and `npm run dev` from the repository root. The Latte recipe demonstrates H2–H6 nesting; the table of contents defaults to H1–H3, so set its upper level to H6 to see every section. The Ordering app article includes SQL and OpenAPI embedded in Markdown.

## Docker

There is no login on the write API; keep the application local (do not expose it as a shared multi-user service).

### Docker Hub image (end users)

No source checkout is required. Copy `docker-compose.hub.yml` from the Atlas Docs repository root (or recreate it), then:

```powershell
docker compose -f docker-compose.hub.yml up -d
```

Default image: `ezwaytechvn/atlas-docs:5.2.1` (override with env `ATLAS_DOCS_VERSION`). The Compose file binds `127.0.0.1:3000:3000`, uses named volumes for `/data` (library) and `/upgrade-backups` (schema-upgrade backups), and sets `restart: unless-stopped`.

Schema upgrades write a full filesystem backup under `ATLAS_DOCS_UPGRADE_BACKUP_DIR` (default `/upgrade-backups` in the image). That path is outside the library and must stay on a persistent volume. Replacing the container while keeping both volumes preserves documents, attachments, and upgrade backups.

**Update (keep data):**

1. Stop is optional; back up volumes or export a ZIP first.
2. If you pin a version, set `ATLAS_DOCS_VERSION` to the new tag.
3. Pull and recreate:

```powershell
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

Do **not** run `docker compose down -v` during an update; `-v` deletes volumes.

**Roll back an image** only when the older image still supports the library `schemaVersion`. If a newer image already migrated the schema, restore the upgrade backup volume (or a ZIP taken before migration). Updating the image is separate from schema migration; migration runs when the library is opened (`ATLAS_DOCS_MIGRATE_YES=1` is set in the image).

**Bind mounts:** if you replace named volumes with host directories on Linux and the app cannot write, `chown` those directories to UID **1000** (the image `node` user).

Readiness: the image HEALTHCHECK calls `GET /api/health`.

### Source checkout Compose (developers)

From the repository root:

```powershell
docker compose up -d --build
```

The container starts with an empty library, mounts `./data` at `/data` and `./.atlas-docs-upgrade-backups` at `/upgrade-backups`, and listens on http://127.0.0.1:3000. To load the optional demo into that empty volume:

```powershell
docker compose stop atlas-docs
docker compose run --rm --no-deps atlas-docs node scripts/seed-demo.mjs
docker compose up -d
```

For a separate demo volume without touching existing `./data`:

```powershell
docker compose build
docker compose run --rm --no-deps -v atlas-cafe-demo:/data -v atlas-cafe-demo-backups:/upgrade-backups atlas-docs node scripts/seed-demo.mjs
docker compose run --rm --no-deps -v atlas-cafe-demo:/data -v atlas-cafe-demo-backups:/upgrade-backups -p 127.0.0.1:3001:3000 atlas-docs
```

Open http://127.0.0.1:3001 for that demo.

### Publish to Docker Hub locally

From the repository root, use PowerShell. Run each step only after the previous step succeeds:

```powershell
$releaseVersion = (Get-Content app/package.json -Raw | ConvertFrom-Json).version
$imageName = 'ezwaytechvn/atlas-docs'
docker build -f app/Dockerfile -t "${imageName}:${releaseVersion}" .
docker run --rm -p 127.0.0.1:3001:3000 -v ${env:TEMP}/atlas-docs-smoke-data:/data -v ${env:TEMP}/atlas-docs-smoke-backups:/upgrade-backups "${imageName}:${releaseVersion}"
```

Open http://127.0.0.1:3001 and check the app, then stop the container with Ctrl+C.
Publish the checked image:

```powershell
docker login
docker push "${imageName}:${releaseVersion}"
docker tag "${imageName}:${releaseVersion}" "${imageName}:latest"
docker push "${imageName}:latest"
```

Prefer `docker buildx` with `linux/amd64,linux/arm64` when you can test both. Only document architectures you actually verified. There is no CI workflow.
npm publishing has a separate [local release checklist](npm.md#build-and-release-maintainers).

## Where data lives

The library is `data/` next to `app/`, or the absolute directory in `DATA_DIR`. It holds `db.json`, `docs/`, `uploads/`, and `history/`. `history/<doc-id>/<timestamp>_<uuid>.md` is one revision; the matching `.json` file is its metadata. `history/observed/` is a copy of current document content written on save. Nothing reads that copy, and version cleanup does not delete it.

## History

Each document keeps 50 revisions and 10 MiB of revision Markdown by default. Metadata is removed with its revision but does not count toward the 10 MiB. After a save that changes content, the oldest revisions are removed first. A save that does not change content does not add a revision. Restoring a revision keeps the snapshot taken just before that restore, even when that one snapshot is larger than the limit; any other excess is reported and still pruned.

The same limits are used by save, the history dialog, and a manual library scan. Open **Utilities → Storage & cleanup** to change them. The ceiling is 500 revisions and 64 MiB of content per document. Saving the setting does not prune the library. The new limit applies on the next document save. Lowering it shows how many revisions could be removed. There is no background timer.

Import does not prune history. If the imported library is over the current limit, the import response lists those documents in `historyOver`. Run the history preview after import if you want to see what a later save would remove.

## Backup and restore

Export a ZIP from the backup controls. The archive includes `db.json`, documents, uploads, and history, plus `atlas-manifest.json` (`format: atlas-docs`, `version: 1`) with a SHA-256 for each data file. The manifest and directory entries are not data files. A data file is `db.json` or a regular file under `docs/`, `uploads/`, or `history/`.

Export and import share one limit. The default, and the highest value you can save, is **140 MiB uncompressed**, **140 MiB ZIP**, and **12,000 data files**. Those numbers come from a load run that exported and imported 11,001 files and a stored archive of about 130 MiB without holding the decompressed library in memory. Change them under **Advanced** in **Utilities → Backup & restore**. A value above the ceiling is rejected.

The app lists names and sizes before copying, holds the library write lock only while taking that snapshot, then writes the ZIP to a temporary file and streams it. If a file changes during the snapshot, export stops and does not return a mixed archive. Import accepts `Content-Type: application/zip`, writes the body to a temporary file, and stops past the ZIP limit. It extracts one entry at a time, counts actual bytes rather than the size declared in the ZIP, checks the manifest, and only then renames the files into an empty library. `db.json` is renamed last. Import refuses a library that already has documents, folders, assets, comments, or files under `docs/`, `uploads/`, or `history/`, and it leaves that library unchanged.

If import stops after it has started replacing files, the next open reads `.import-journal.json` and deletes only the paths recorded for that task. An empty library must not look successfully imported until every file is in place. You can also stop the app and copy the whole data directory.

### Storage and cleanup

**Utilities → Storage & cleanup** shows the library total, then documents, history, and attachments. History metadata, `history/observed`, and `db.json` stay in the technical details. Temporary files, dotfiles, and other paths outside those groups are listed separately and are not part of the backup total. Symbolic links are recorded and not followed. A directory that cannot be read is an error, not zero bytes. The screen also shows the active backup limits, an upper estimate of ZIP size (backup bytes plus 128 bytes per data file), a warning at 80% of a finite limit, and a block when the library is over the current backup limit. Use **Refresh** to bypass the short cache.

Cleanup scans current document content, every kept history revision, folder cover images, comments, and `/api/media/{id}` links the app writes. **Quét** returns a preview with ids, sizes, and reasons. Files used by current content are not offered for deletion. Files used only by history are shown and are not selected for you. Files in the library with no reference can be selected. A file on disk without a database record is reported and is not deleted by path. A database record without a file is reported as missing and is not counted as reclaimable space. If a file cannot be read, or a media link is not a known id, the scan says there is not enough information and does not treat those files as unused. Confirm the count and size; the server checks each selected id again and deletes only the ones that are still eligible. The result lists deleted, skipped because they are in use, and failed. Nothing is deleted by age. A draft that exists only in the browser is not known to the server.

### Limits that remain

The browser download reads the finished ZIP into a blob, so the browser holds the compressed archive. The upload is a raw body, but the Next.js server may still buffer that body before the app writes it to disk. New exports are stored in 64 KiB chunks. An older ZIP that uses deflate can still allocate one entry's output in a single buffer while it is inflated. `history/observed` is still written and is not removed.

Existing local data is preserved when it stops being tracked by Git. Older commits are not rewritten. Back up your data before updating an older checkout; Git updates that remove previously tracked files may remove unchanged copies in other checkouts.

## Checks

From the repository root:

```powershell
npm --prefix app run test:storage
npm run typecheck
npm run build
npm --prefix app run test:resources
npm --prefix app run test:demo
npm --prefix app run test:backup
npm --prefix app run test:storage-stats
npm --prefix app run test:references
npm --prefix app run test:history-policy
```

`npm --prefix app run test:backup-load` is separate. It builds large temporary libraries and is not part of the normal check.

Tests use temporary libraries. The demo integration test requires a production build and Playwright Chromium for browser checks. Docker is not required for local use.

### Browser test setup

From the repository root, install the matching Playwright Chromium build once:

```powershell
npm --prefix app exec -- playwright install chromium
```

Browser tests use Chromium by default. Set `ATLAS_TEST_BROWSER` to `msedge` or
`chrome` to use an installed Microsoft Edge or Google Chrome. Only `chromium`,
`msedge`, and `chrome` are accepted; an invalid value fails before a test starts.
No automatic browser fallback is used.

```powershell
$env:ATLAS_TEST_BROWSER = 'msedge'
npm --prefix app run test:ui
Remove-Item Env:ATLAS_TEST_BROWSER
```

On macOS/Linux, use `ATLAS_TEST_BROWSER=chrome npm --prefix app run test:ui`.
For Linux browser dependencies, run `npm --prefix app exec -- playwright install --with-deps chromium`.
Demo, library UI, and Help checks need a production build; set `ATLAS_DIST_DIR`
to that build directory for both build and test. Use a temporary `DATA_DIR`
when building for tests. Test scripts create separate temporary libraries.

## Command reference

The root `package.json` keeps the common app and release commands; it has no dependencies and needs no root `node_modules`. Use `npm run setup` to install dependencies into `app/node_modules`. Run `npm run` for common commands or `npm --prefix app run` for detailed app tests. Run Docker Compose directly. All commands below run from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install or update app dependencies according to its manifest and lockfile |
| `npm run package:release` | Build in an isolated output directory and create the npm tarball plus `.sha256`; never publishes |
| `npm run test:tooling` | Check browser selection and package path privacy |
| `npm run test:core` | Shared library checks (inspect, lock, migrate, import schema) using temporary directories |
| `npm run test:cli` | Check CLI options and agent-guide preservation using temporary directories |
| `npm run test:package` | Install and exercise the actual tarball outside the checkout |
| `npm run test:upgrade-artifacts` | Verify upgrade from the pinned 5.1.0 tarball to the locally built release, using temporary libraries |
| `npm run check:distribution` | Typecheck, storage tests, core tests, and CLI tests |
| `npm run dev` | Start the development server; initializes missing data automatically |
| `npm run build` / `npm start` | Build / start the production app |
| `npm run bootstrap` | Initialize an empty library without starting the app |
| `npm run seed:demo` | Load Little Café into an empty library, with the app stopped |
| `npm run check` | Run typecheck and storage tests; no production build required |
| `npm run typecheck` | Check TypeScript types |
| `npm --prefix app run test:storage` | Check bootstrap, demo validation, and data preservation |
| `npm --prefix app run test:backup` | Check shared backup limits, round-trip, and interrupted import |
| `npm --prefix app run test:backup-load` | Measure large backup export and import; not part of the normal check |
| `npm --prefix app run test:storage-stats` | Check storage groups against files on disk |
| `npm --prefix app run test:references` | Check cleanup preview, history references, and partial delete |
| `npm --prefix app run test:history-policy` | Check history limits, restore protection, and import without pruning |
| `npm --prefix app run test:library-ui` | Check the utilities menu, backup screen, and cleanup flow in a temporary library |
| `npm --prefix app run test:i18n` | Check locale detection, catalog key parity, and translation fallback |
| `npm --prefix app run test:resources` / `npm --prefix app run test:demo` | Integration checks; run build first |
| `npm --prefix app run test:ui` / `npm --prefix app run test:headings` / `npm --prefix app run test:responsive` | UI, heading, and mobile shell tests; require Playwright Chromium |
| `docker compose up -d --build` | Build and start the **source** Compose file in the background |
| `docker compose -f docker-compose.hub.yml up -d` | Start from the Docker Hub image (no build) |
| `docker compose stop` | Stop Docker without deleting data |
| `docker compose logs -f` / `docker compose ps` | Follow container logs / show status |

Extra arguments are forwarded, for example `npm run dev -- --port 3001`. `DATA_DIR` is inherited by all forwarded app commands.

## Update an installation

**Source checkout**

1. Stop the app and back up the complete active data directory, or export a ZIP before stopping.
2. Review changes and preserve local source edits before updating the checkout. Older checkouts may have tracked data files; see the warning above.
3. Run `npm run setup`, then `npm run build`.
4. Start with the same absolute `DATA_DIR` using `npm start`. For source Docker, keep the same volumes and rebuild with `docker compose up -d --build`.
5. Open a known document and attachment. Keep the backup until the updated installation is verified.

**npm package:** see [npm updates](npm.md#updates). **Docker Hub image:** see [Docker Hub image](#docker-hub-image-end-users). App updates do not replace library data; schema migration (if needed) runs when the library is opened and creates a full backup under the upgrade-backup directory.

## Troubleshooting

| Symptom | Check and action |
| --- | --- |
| Library looks empty | Check the active `DATA_DIR` and Docker volume. Do not seed or import until you have confirmed the intended library. |
| A file does not appear | Check the supported extension, lowercase filename, folder depth, and required parent folder in the [agent guide](agent-guide.md). Reload the browser after external edits. |
| Visual mode is unavailable | Complex Markdown requires Source, Split, or Preview; see the [user guide](user-guide.md). |
| Import is refused | Use an empty library and check the archive limits. Never erase a working library to make import succeed. |
| Backup exceeds limits | Review storage and cleanup previews. Export again only after the library fits the configured limits. |
| Cleanup cannot determine usage | Resolve unreadable files or unknown media links; do not interpret an incomplete scan as permission to delete. |
| A command fails | Confirm Node.js 22.12 or newer, install dependencies from the repository root, and read the command's error before retrying. |

## Version project documents with Git

The default `data/` is ignored by the Atlas Docs repository. To keep project documents in their own Git repository, create a separate data root beside both repositories:

```text
workspace/
  my-product/
  atlas-docs/
  my-product-docs/
    docs/
    db.json
    uploads/
    history/
```

PowerShell, from `atlas-docs/` (use your actual absolute path):

```powershell
$env:DATA_DIR = 'C:/workspace/my-product-docs'
npm run bootstrap
npm run dev
```

On macOS/Linux, use `export DATA_DIR="/absolute/workspace/my-product-docs"`. Keep this variable set for every command using that library. The app adds `docs/` underneath `DATA_DIR`; do not point it at `my-product-docs/docs`.

Initialize Git in `my-product-docs` yourself and track `docs/` for text history. For a text-only repository, ignore `/db.json`, `/uploads/`, `/history/`, and temporary or journal files. Upload-backed images require the original library data to render. Do not commit secrets or private uploads accidentally.

Git history of `docs/` is not a complete Atlas Docs backup: it excludes comments, media records, preferences, uploads, and app revisions. Use ZIP export or a stopped-app copy of the whole data root for full recovery. For Docker, change the volume mapping explicitly; the host shell variable does not replace the compose file's `./data:/data` mapping.

## Maintain Help and screenshots

Maintain translations directly in `app/src/lib/i18n/messages/`, then run
`npm --prefix app run test:i18n`. The one-time catalog generation and translation patch scripts
have been removed; the checked-in TypeScript catalogs are the source of truth.

Help is generated automatically by `npm run dev` and `npm run build`. From the repository root, run `node scripts/build/prepare-help.mjs` to refresh the generated bundle manually. A fresh checkout also prepares it before type checking. The generated JSON and public image copies are ignored by Git; their sources in `guides/` are tracked.

After a production build, run `npm --prefix app run test:help`. It starts a separate server on port 3239, seeds a temporary Little Café library, uses the selected headless browser (Chromium by default) in English/light mode, and checks Help while capturing walkthrough screenshots. The test never uses the working library. Set `ATLAS_DIST_DIR` to the same value used for an isolated build if applicable. Set `HELP_DEV=1` to test an isolated development server instead. Screenshots are written to `app/test-results/help-assets/`, with unannotated images in its `originals/` directory. To deliberately refresh guide images, set `HELP_SCREENSHOT_DIR` to the absolute `guides/assets/` path, review the results, then rebuild. Normal tests do not change guide images.

Review the screenshots visually before committing: the red numbered outlines identify actual controls, and nearby guide text explains the numbers. Keep browser dimensions and the demo consistent when refreshing images.
