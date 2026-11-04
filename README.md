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

## Backup and restore

Export a ZIP using the app backup controls. The archive includes `db.json`, documents, uploads, and history. To test restore, stop the app, point `DATA_DIR` at a new empty directory, start the app, and import the ZIP. Import refuses a non-empty library. Alternatively, with the app stopped, copy the entire data directory as a filesystem backup.

Existing local data is preserved when it stops being tracked by Git. Older commits are not rewritten. Back up your data before updating an older checkout; Git updates that remove previously tracked files may remove unchanged copies in other checkouts.

## Checks

From the repository root:

```powershell
npm run test:storage
npm run typecheck
npm run build
npm run test:resources
npm run test:demo
```

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
| `npm run test:resources` / `npm run test:demo` | Integration checks; run build first |
| `npm run test:ui` / `npm run test:headings` | UI and heading tests; require Microsoft Edge |
| `npm run docker:up` | Build and start Docker in the background |
| `npm run docker:stop` | Stop Docker without deleting data |
| `npm run docker:logs` / `npm run docker:status` | Follow container logs / show status |

Extra arguments are forwarded, for example `npm run dev -- --port 3001`. `DATA_DIR` is inherited by all forwarded app commands.
