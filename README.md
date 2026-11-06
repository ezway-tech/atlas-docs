# Atlas Docs

A local library for Markdown, OpenAPI, YAML, SQL, and JSON. The interface is in Vietnamese. The optional **Little Café** demo is in English.

```text
atlas-docs/
├── app/                   # Next.js app
├── examples/little-cafe/   # Source for the optional demo
├── data/                  # Your library; ignored by Git
└── docker-compose.yml
```

## Install and run

Requires Node.js 22.12 or newer. From the repository root:

```powershell
npm run setup
npm run bootstrap
npm run dev
```

Open http://127.0.0.1:3000. Bootstrap creates an **empty** library. It also runs automatically before `npm run dev` and `npm start`. Repeating it does not replace existing data. For production, run `npm run build`, then `npm start`.

## Optional Little Café demo

With the app stopped, from the repository root:

```powershell
npm run seed:demo
npm run dev
```

Seeding validates the bundled sample, then copies it into an empty library. It refuses existing documents, folders, assets, comments, history, or unexpected files. There is no force/overwrite option. An empty database created by bootstrap is accepted. Do not seed while the app is running.

Start at **Start here → Welcome to Little Café → Explore Atlas Docs**. The 13 short documents cover Markdown, links, Mermaid, OpenAPI, SQL, YAML, and JSON. Five original media files demonstrate image previews, CSV download, audio, and video. A sample comment and two older recipe revisions demonstrate discussion and history. Menu starts pinned; Operations → Stock starts hidden and can be shown from the dashboard.

All content is fictional. The graphics, synthesized chime, and animated diagram were created for this repository and share its MIT license. The ordering API is documentation only; no ordering backend is supplied. No external media downloads are needed to use the sample.

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

From the repository root:

```powershell
docker compose up -d --build
```

The container starts with an empty library, mounts `./data` at `/data`, and listens on http://127.0.0.1:3000. To load the optional demo into that empty volume:

```powershell
docker compose stop atlas-docs
docker compose run --rm --no-deps atlas-docs node scripts/seed-demo.mjs
docker compose up -d
```

For a separate demo volume without touching existing `./data`:

```powershell
docker compose build
docker compose run --rm --no-deps -v atlas-cafe-demo:/data atlas-docs node scripts/seed-demo.mjs
docker compose run --rm --no-deps -v atlas-cafe-demo:/data -p 127.0.0.1:3001:3000 atlas-docs
```

Open http://127.0.0.1:3001 for that demo. There is no login on the write API; keep the application local.

## Where data lives

The library is `data/` next to `app/`, or the absolute directory in `DATA_DIR`. It holds `db.json`, `docs/`, `uploads/`, and `history/`. `history/<doc-id>/<timestamp>_<uuid>.md` is one revision; the matching `.json` file is its metadata. `history/observed/` is a copy of current document content written on save. Nothing reads that copy, and version cleanup does not delete it.

## History

Each document keeps 50 revisions and 10 MiB of revision Markdown by default. Metadata is removed with its revision but does not count toward the 10 MiB. After a save that changes content, the oldest revisions are removed first. A save that does not change content does not add a revision. Restoring a revision keeps the snapshot taken just before that restore, even when that one snapshot is larger than the limit; any other excess is reported and still pruned.

The same limits are used by save, the history dialog, and a manual library scan. Open **Tiện ích → Dung lượng & dọn dẹp** to change them. The ceiling is 500 revisions and 64 MiB of content per document. Saving the setting does not prune the library. The new limit applies on the next document save. Lowering it shows how many revisions could be removed. There is no background timer.

Import does not prune history. If the imported library is over the current limit, the import response lists those documents in `historyOver`. Run the history preview after import if you want to see what a later save would remove.

## Backup and restore

Export a ZIP from the backup controls. The archive includes `db.json`, documents, uploads, and history, plus `atlas-manifest.json` (`format: atlas-docs`, `version: 1`) with a SHA-256 for each data file. The manifest and directory entries are not data files. A data file is `db.json` or a regular file under `docs/`, `uploads/`, or `history/`.

Export and import share one limit. The default, and the highest value you can save, is **140 MiB uncompressed**, **140 MiB ZIP**, and **12,000 data files**. Those numbers come from a load run that exported and imported 11,001 files and a stored archive of about 130 MiB without holding the decompressed library in memory. Change them under **Nâng cao** in **Tiện ích → Sao lưu & khôi phục**. A value above the ceiling is rejected.

The app lists names and sizes before copying, holds the library write lock only while taking that snapshot, then writes the ZIP to a temporary file and streams it. If a file changes during the snapshot, export stops and does not return a mixed archive. Import accepts `Content-Type: application/zip`, writes the body to a temporary file, and stops past the ZIP limit. It extracts one entry at a time, counts actual bytes rather than the size declared in the ZIP, checks the manifest, and only then renames the files into an empty library. `db.json` is renamed last. Import refuses a library that already has documents, folders, assets, comments, or files under `docs/`, `uploads/`, or `history/`, and it leaves that library unchanged.

If import stops after it has started replacing files, the next open reads `.import-journal.json` and deletes only the paths recorded for that task. An empty library must not look successfully imported until every file is in place. You can also stop the app and copy the whole data directory.

### Storage and cleanup

**Tiện ích → Dung lượng & dọn dẹp** shows the library total, then documents, history, and attachments. History metadata, `history/observed`, and `db.json` stay in the technical details. Temporary files, dotfiles, and other paths outside those groups are listed separately and are not part of the backup total. Symbolic links are recorded and not followed. A directory that cannot be read is an error, not zero bytes. The screen also shows the active backup limits, an upper estimate of ZIP size (backup bytes plus 128 bytes per data file), a warning at 80% of a finite limit, and a block when the library is over the current backup limit. Use **Làm mới** to bypass the short cache.

Cleanup scans current document content, every kept history revision, folder cover images, comments, and `/api/media/{id}` links the app writes. **Quét** returns a preview with ids, sizes, and reasons. Files used by current content are not offered for deletion. Files used only by history are shown and are not selected for you. Files in the library with no reference can be selected. A file on disk without a database record is reported and is not deleted by path. A database record without a file is reported as missing and is not counted as reclaimable space. If a file cannot be read, or a media link is not a known id, the scan says there is not enough information and does not treat those files as unused. Confirm the count and size; the server checks each selected id again and deletes only the ones that are still eligible. The result lists deleted, skipped because they are in use, and failed. Nothing is deleted by age. A draft that exists only in the browser is not known to the server.

### Limits that remain

The browser download reads the finished ZIP into a blob, so the browser holds the compressed archive. The upload is a raw body, but the Next.js server may still buffer that body before the app writes it to disk. New exports are stored in 64 KiB chunks. An older ZIP that uses deflate can still allocate one entry's output in a single buffer while it is inflated. `history/observed` is still written and is not removed.

Existing local data is preserved when it stops being tracked by Git. Older commits are not rewritten. Back up your data before updating an older checkout; Git updates that remove previously tracked files may remove unchanged copies in other checkouts.

## Checks

From the repository root:

```powershell
npm run test:storage
npm run typecheck
npm run build
npm run test:resources
npm run test:demo
npm run test:backup
npm run test:storage-stats
npm run test:references
npm run test:history-policy
```

`npm run test:backup-load` is separate. It builds large temporary libraries and is not part of the normal check.

Tests use temporary libraries. The demo integration test requires a production build and Microsoft Edge for browser checks. Docker is not required for local use.

## Root command reference

The root `package.json` only forwards commands; it has no dependencies and needs no root `node_modules`. Use `npm run setup` to install dependencies into `app/node_modules`. These npm commands work on Windows, Linux, and macOS. Run `npm run` to list them.

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install or update app dependencies according to its manifest and lockfile |
| `npm run dev` | Start the development server; initializes missing data automatically |
| `npm run build` / `npm start` | Build / start the production app |
| `npm run bootstrap` | Initialize an empty library without starting the app |
| `npm run seed:demo` | Load Little Café into an empty library, with the app stopped |
| `npm run check` | Run typecheck and storage tests; no production build required |
| `npm run typecheck` | Check TypeScript types |
| `npm run test:storage` | Check bootstrap, demo validation, and data preservation |
| `npm run test:backup` | Check shared backup limits, round-trip, and interrupted import |
| `npm run test:backup-load` | Measure large backup export and import; not part of the normal check |
| `npm run test:storage-stats` | Check storage groups against files on disk |
| `npm run test:references` | Check cleanup preview, history references, and partial delete |
| `npm run test:history-policy` | Check history limits, restore protection, and import without pruning |
| `npm run test:library-ui` | Check the utilities menu, backup screen, and cleanup flow in a temporary library |
| `npm run test:resources` / `npm run test:demo` | Integration checks; run build first |
| `npm run test:ui` / `npm run test:headings` / `npm run test:responsive` | UI, heading, and mobile shell tests; require Microsoft Edge |
| `npm run docker:up` | Build and start Docker in the background |
| `npm run docker:stop` | Stop Docker without deleting data |
| `npm run docker:logs` / `npm run docker:status` | Follow container logs / show status |

Extra arguments are forwarded, for example `npm run dev -- --port 3001`. `DATA_DIR` is inherited by all forwarded app commands.
