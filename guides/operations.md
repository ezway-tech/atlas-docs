# Operations guide

[Documentation home](../README.md) · [User guide](user-guide.md) · [Agent guide](agent-guide.md)

Commands below run from the Atlas Docs repository root unless stated otherwise. The interface supports five languages (vi, en, zh-Hans, es, ja). Pick one from **Utilities → Language**. Guides use English names for features; on-screen labels follow the selected language.
## Install and run

All installations use **Projects**. On a clean first launch, Atlas prepares one durable **Example** project. Create a project or open an existing project folder; Atlas creates the database and storage directories before documents are added. Restarting preserves Example edits, projects, and the registry. The home URL opens Projects; reloading a workspace or document keeps that page.

For npm, see [npm usage](npm.md). From a source checkout with Node.js 22.12 or newer:

```powershell
npm run setup
npm run dev
```

Open http://127.0.0.1:3000. For production, build with `npm run build`, then `npm start`. Use `ATLAS_OPEN_LIBRARY` with an absolute existing project root to select a project at startup; project switching remains available. Existing repository `data/` is registered if valid, never replaced.

`DATA_DIR` and `ATLAS_LIBRARY_MODE=fixed` are no longer supported launcher configuration. Remove them before starting npm/source/Docker. `DATA_DIR` is still used internally by child runtimes and explicitly scoped bootstrap, seed, and test tools.

For agent-generated content, follow [Initialize before writing](agent-guide.md#initialize-before-writing). A library includes `db.json`, `docs/`, `uploads/`, and `history/`. A manually created `docs/` without a database is refused.

## Example project (Little Café content)

Example is created once under the application-data libraries directory, or `ATLAS_DOCS_LIBRARIES_DIR`. Its identity is saved in the registry outside the project. Edits are preserved; an invalid existing Example is not overwritten. A missing Example can be recreated in a new empty location. Example failure does not prevent opening another valid project.

Example includes Markdown, OpenAPI, SQL, YAML, JSON, media, comments, and history. All content is fictional and distributed under the repository MIT license. The café images were generated with OpenAI ImageGen. See [demo image credits](demo-image-prompts.md).

### Keep existing data and try the demo separately

Open Example from Projects; it is separate from your own library. Do not seed or import over existing content. To test a newer sample, use a separate temporary registry and libraries directory. The maintenance command `npm run seed:demo` accepts a temporary absolute `DATA_DIR` and refuses a nonempty library. Unset that variable before launching the app, then open the prepared folder through Projects.

## Docker

### Docker Hub image (end users)

Copy [docker-compose.hub.yml](../docker-compose.hub.yml), then:

```powershell
docker compose -f docker-compose.hub.yml up -d
```

Open http://127.0.0.1:17430. The default image is `ezwaytechvn/atlas-docs:6.0.0`; override with `ATLAS_DOCS_VERSION`. Override the host port with `ATLAS_DOCS_PORT`. Keep the localhost binding: there is no login on the write API.

Projects is the only Docker mode. The standard Compose persists three named volumes: `/libraries` for individual projects (including Example), `/atlas-registry` for the project list and Example identity, and `/upgrade-backups` for schema backups. Preserve all three when recreating or upgrading the container. Never run `docker compose down -v` to update.

Use a host bind mount instead of the libraries named volume when a host agent needs direct file access. Container paths and host paths are different; the UI only browses mounted allowed roots. On Linux, writable folders must be accessible to UID 1000. `ATLAS_OPEN_LIBRARY=/libraries/my-project` optionally selects an existing project, without disabling switching. Docker installs the versioned agent guide into a library when it prepares that library.

### Upgrade from the old fixed /data layout

Version 6 removes fixed mode and the separate multi-library Compose files. Do not merely replace the image while retaining `DATA_DIR=/data`; startup will report the obsolete setting without changing data.

1. Stop the old container and back up the complete old library or its volume. Preserve the old Compose file and volume names.
2. Use the new standard Compose with persistent libraries, registry, and upgrade-backup volumes. Remove `DATA_DIR` and `ATLAS_LIBRARY_MODE=fixed`.
3. Add the old named volume as an external volume and mount it at `/libraries/existing-project`, or copy the entire stopped library into a host directory mounted there. Copy all four data entries and any personal agent instructions; copying only `docs/` loses metadata and media.
4. Start Atlas, open `/libraries/existing-project` from Projects, and verify documents, attachments, comments, and history. Keep the backup and original data until verified. There is no automatic move or deletion.

Example additional Compose mount (replace the actual old volume name):

```yaml
services:
  atlas-docs:
    volumes:
      - old-project:/libraries/existing-project
volumes:
  old-project:
    external: true
    name: YOUR_EXISTING_VOLUME_NAME
```

Merge this with the standard Compose; retain its three persistent mounts. Docker does not infer the old volume name for you.

### Build from source

```powershell
docker compose up -d --build
```

Open http://127.0.0.1:3000. Source Compose persists `./libraries`, `./atlas-registry`, and `./.atlas-docs-upgrade-backups`. It uses the same Projects workflow as npm and the published Docker image.

### Publish to Docker Hub locally

From the repository root, use PowerShell. Run each step only after the previous step succeeds:

```powershell
$releaseVersion = (Get-Content app/package.json -Raw | ConvertFrom-Json).version
$imageName = 'ezwaytechvn/atlas-docs'
docker build -f app/Dockerfile -t "${imageName}:${releaseVersion}" .
docker run --rm -p 127.0.0.1:3001:3000 -v ${env:TEMP}/atlas-docs-smoke-libraries:/libraries -v ${env:TEMP}/atlas-docs-smoke-registry:/atlas-registry -v ${env:TEMP}/atlas-docs-smoke-backups:/upgrade-backups "${imageName}:${releaseVersion}"
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

### Update Docker Hub Overview

The Hub repository short description and full Overview are not taken from the image. Edit [`docker-hub-overview.md`](docker-hub-overview.md), then update the Hub repository metadata after you authenticate with Docker Hub (JWT from the Hub login API; see [Docker Hub API authentication](https://docs.docker.com/docker-hub/api/latest/#tag/authentication)). Some personal access tokens return 403 for description updates — use an account password or a token that can update repository metadata.

### Keep public agent instructions aligned

GitHub renders the root `README.md`; the npm package README is built from `guides/npm.md`; Docker Hub Overview is published separately from `guides/docker-hub-overview.md`. Updating one does not update the others. The agent-kit copies `guides/agent-guide.md` into `.atlas/guides/` during library preparation; built-in Help bundles that guide at build time. Existing library `AGENTS.md` files are preserved, so new template rules do not overwrite personal instructions.

For a documentation release, verify all three public entry points explain initialization before content generation, show `db.json` beside `docs/`, and link to the agent guide. Verify those links on the published pages, including raw Markdown access for web-reading agents. Check the installed package's bundled guide as well. If a separate website repeats setup instructions, update its owning project separately; this repository does not automatically publish those pages. Do not report local edits as published documentation.

PowerShell example (set `$token` to the JWT from Hub authentication first):

```powershell
$overview = Get-Content -Raw guides/docker-hub-overview.md
$headers = @{ Authorization = "JWT $token"; 'Content-Type' = 'application/json' }
$body = @{
  full_description = $overview
  description = 'Local project docs library: browse, edit, and search Markdown, OpenAPI, SQL, and more.'
} | ConvertTo-Json -Depth 3
Invoke-RestMethod -Method Patch -Uri 'https://hub.docker.com/v2/repositories/ezwaytechvn/atlas-docs/' -Headers $headers -Body $body
```

Verify https://hub.docker.com/r/ezwaytechvn/atlas-docs shows the new Overview and screenshots. Image tags are unchanged by this step.

## Where data lives

The library is the selected project folder shown in Projects. It holds `db.json`, `docs/`, `uploads/`, and `history/`. `history/<doc-id>/<timestamp>_<uuid>.md` is one revision; the matching `.json` file is its metadata. `history/observed/` is a copy of current document content written on save. Nothing reads that copy, and version cleanup does not delete it.

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
| `npm run test:upgrade-from-5.3.0` | Download published 5.3.0, seed a temp library, then reopen it with the local release tarball (no schema migration expected) |
| `npm run check:distribution` | Typecheck, storage tests, core tests, and CLI tests |
| `npm run dev` | Start the managed development server (recent project or Example) |
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

Extra arguments are forwarded, for example `npm run dev -- --port 3001`. Use `ATLAS_OPEN_LIBRARY` to select an existing project; `DATA_DIR` is reserved for child runtimes and maintenance tools.

## Update an installation

Open **Help → Version & updates** to see the running version and installation-specific instructions. Source development shows **Development** without registry checks. For verified global npm installations started by the CLI, **Update and restart** runs the update and restarts the same library and port after confirmation. Source and Docker updates remain manual. See [npm updates](npm.md#updates) for progress and recovery details.

**Source checkout**

1. Stop the app and back up the complete active data directory, or export a ZIP before stopping.
2. Review changes and preserve local source edits before updating the checkout. Older checkouts may have tracked data files; see the warning above.
3. Run `npm run setup`, then `npm run build`.
4. Start with `npm start` and select the same project from Projects. For source Docker, keep the same volumes and rebuild with `docker compose up -d --build`.
5. Open a known document and attachment. Keep the backup until the updated installation is verified.

**npm package:** see [npm updates](npm.md#updates). **Docker Hub image:** see [Docker Hub image](#docker-hub-image-end-users). App updates do not replace library data; schema migration (if needed) runs when the library is opened and creates a full backup under the upgrade-backup directory.

## Troubleshooting

| Symptom | Check and action |
| --- | --- |
| Library looks empty | Check the selected project path and Docker volume. Do not seed or import until you have confirmed the intended library. |
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
npm run dev
# In Projects, create or open C:/workspace/my-product-docs
```

On macOS/Linux, choose the absolute project folder through Projects as well. Select the parent containing `db.json` and `docs/`, not `docs/` alone.

Initialize Git in `my-product-docs` yourself and track `docs/` for text history. For a text-only repository, ignore `/db.json`, `/uploads/`, `/history/`, and temporary or journal files. Upload-backed images require the original library data to render. Do not commit secrets or private uploads accidentally.

Git history of `docs/` is not a complete Atlas Docs backup: it excludes comments, media records, preferences, uploads, and app revisions. Use ZIP export or a stopped-app copy of the whole data root for full recovery. For Docker, change the volume mapping explicitly; mount the entire project beneath `/libraries` and preserve the registry volume.

## Maintain Help and screenshots

Maintain translations directly in `app/src/lib/i18n/messages/`, then run
`npm --prefix app run test:i18n`. The one-time catalog generation and translation patch scripts
have been removed; the checked-in TypeScript catalogs are the source of truth.

Help is generated automatically by `npm run dev` and `npm run build`. From the repository root, run `node scripts/build/prepare-help.mjs` to refresh the generated bundle manually. A fresh checkout also prepares it before type checking. The generated JSON and public image copies are ignored by Git; their sources in `guides/` are tracked.

After a production build, run `npm --prefix app run test:help`. It starts a separate server on port 3239, seeds a temporary Little Café library, uses the selected headless browser (Chromium by default) in English/light mode, and checks Help while capturing walkthrough screenshots. The test never uses the working library. Set `ATLAS_DIST_DIR` to the same value used for an isolated build if applicable. Set `HELP_DEV=1` to test an isolated development server instead. Screenshots are written to `app/test-results/help-assets/`, with unannotated images in its `originals/` directory. To deliberately refresh guide images, set `HELP_SCREENSHOT_DIR` to the absolute `guides/assets/` path, review the results, then rebuild. Normal tests do not change guide images.

Review the screenshots visually before committing: the red numbered outlines identify actual controls, and nearby guide text explains the numbers. Keep browser dimensions and the demo consistent when refreshing images.

### Project manager checks

`npm --prefix app run test:source-picker` exercises Example open/reuse, create/open/initialize empty, invalid folders, cancel folder pick, missing-path list, remove/delete confirmation, stale tabs, locked projects, unsaved drafts, keyboard controls, desktop/mobile layout, and managed startup without native folder picking. It uses temporary projects and registry storage. Build with `ATLAS_DIST_DIR=test-results/builds/source-picker` first; use a temporary `DATA_DIR` for that build. Set `ATLAS_SOURCE_TEST_DEV=1` and a separate `ATLAS_DIST_DIR` to check the development manager and one Example switch instead. Native folder picks are mocked with `ATLAS_DOCS_PICK_FOLDER_MOCK`. The reveal check opens only a temporary test project.

Set `ATLAS_LOCAL_DESKTOP=0` for a server without a local desktop; the UI uses in-app browse and path copying instead of the OS folder dialog or host file manager.
