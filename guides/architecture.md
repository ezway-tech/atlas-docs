# Architecture

[Documentation home](../README.md) · [Agent guide](agent-guide.md) · [Operations](operations.md)

Atlas Docs is a local Next.js application. React components provide the workspace; Node.js route handlers read and write a file-backed library. The interface is localized (vi, en, zh-Hans, es, ja) through message catalogs and a browser locale cookie; document content stays as authored. There is no authenticated multi-user write boundary; run it locally.

## Source map

| Location | Responsibility |
| --- | --- |
| `app/src/library/` | Shared library logic: path resolve, inspect, schema, lock, migrate, full backup, agent-kit, update check (no Next.js, no terminal UI) |
| `app/src/cli/` | Argument parsing, prompts, browser open, command router (`start`, `library`, `doctor`, `update`) |
| `app/src/app/` | Next.js layout, page routes, CSS, and catch-all API route |
| `app/src/components/Workspace.tsx` | Main library navigation, reading, editing, search, and dialogs |
| `app/src/components/` | Markdown/OpenAPI/SQL viewers, visual/source editors, resource library, history and utility dialogs |
| `app/src/lib/store.ts` | Catalog scanning, folder/document operations, metadata access, revisions, and in-process write coordination |
| `app/src/lib/runtime-prepare.ts` | Loads `core` and runs the shared prepare pipeline when the server starts |
| `app/src/lib/data-root.ts` | Resolve the active library root for the app process |
| `app/src/lib/backup.ts` | ZIP import/export; import stages go through core schema checks |
| `app/src/lib/asset-references.ts` | Reference scanning and cleanup eligibility |
| `app/src/lib/` | Shared types, history/backup policies, asset validation, parsing, and shortcuts |
| `app/src/lib/i18n/` | Locale detection, message catalogs, formatting helpers, and API error keys |
| `app/src/middleware.ts` | Sets the `atlas-locale` cookie from Accept-Language on first visit |
| `scripts/setup/` | Library bootstrap and demo seeding |
| `scripts/tests/app/` | App tests and browser fixtures |
| `examples/little-cafe/` | Optional sample content copied into an empty library |
| `scripts/templates/` | Library `AGENTS.md` template and agent-kit composition inputs |
| `scripts/build/` | Release packaging, Help preparation, agent-kit composer, and process helper |
| `scripts/tests/` | App, library, CLI, and package tests; shared test helpers |

Paths in this table are relative to the repository root. The root package forwards npm commands into `app/`; dependencies are installed there.

All development tools live under `scripts/`. Node tools outside the app resolve dependencies through `scripts/dependencies.mjs`; no root dependency installation is needed. Tests are grouped into `app`, `library`, `cli`, and `package`, with shared helpers. New test builds, bundles, reports, and Help captures go under `app/test-results/`. Older ignored build caches may remain locally; they are not source folders.

The npm distribution packages `bin/` (CLI), `core/`, `runtime/` (Next standalone), and `agent-kit/`. `npm run package:release` builds one tarball and a `.sha256` checksum. Source and Docker keep their existing data defaults (`../data` and `/data`); the npm CLI defaults to `./atlas-docs-data` unless `--data-dir`, `DATA_DIR`, or `atlas-docs.config.json` selects another path. See [npm usage](npm.md).

## Versions

| Concept | Where | Notes |
| --- | --- | --- |
| App SemVer | `app/package.json` (single source) | PATCH compatible fixes; MINOR compatible features; MAJOR breaking changes |
| `schemaVersion` | Integer field in `db.json` | Current value **1**. Independent of app SemVer |
| Agent-kit | `.atlas/manifest.json` | Tracks app version and checksums of managed guide files |
| ZIP backup format | `atlas-manifest.json` `version` | Archive format (still **1**); not a substitute for `schemaVersion` |

## Library open pipeline

Every entry point (npm CLI server, source bootstrap + runtime, Docker) uses `core` prepare in this order:

1. Resolve the library path.
2. Inspect read-only (`missing` / `empty` / `ready` / `legacy` / `newer` / `unknown` / `interrupted`).
3. Acquire the cross-process lock (`.atlas-docs.lock`).
4. Recover a safe interrupted migration when possible; import journal recovery stays in the app store.
5. Init or migrate only when allowed and confirmed.
6. Sync agent-kit when a kit path is configured.
7. Start serving; open the browser from the CLI after health checks.

The server process owns the lock for its lifetime. A second Atlas Docs process on the same canonical library path is refused. The lock coordinates Atlas Docs processes only; it does not block external editors.

## Data model

`DATA_DIR`, when set, selects the library root for source/Docker. Otherwise the app resolves to `../data` from the app working directory. Root npm commands run inside `app/`, so the normal source default is the repository's `data/`. Prefer absolute custom paths.

| Library path | Contents |
| --- | --- |
| `docs/` | User Markdown, YAML, SQL, and JSON files, grouped in folders |
| `db.json` | `schemaVersion`, assets, folders, comments, navigation order, and settings |
| `uploads/` | Attachment bytes referenced by asset IDs |
| `history/` | Revision content and metadata; also the observed-content copies |

## Request and save flow

1. The workspace requests documents, folders, settings, and other library data through `/api/` routes.
2. The API validates inputs and delegates to storage or feature modules. Viewers render the resulting document according to its format.
3. Saving changed content through the app captures the previous content as a revision, writes the replacement through a temporary file, updates the observed copy, applies history limits, and invalidates the catalog entry. Saving identical content creates no revision.
4. Direct filesystem edits are found by later scans but bypass revision creation and server write coordination. Reload the browser to request fresh data.

Metadata writes also use in-process queues inside one server. Cross-process exclusivity for open/migrate is the file lock above.

## Rendering and editing

Markdown supports headings, tables, links, images, Mermaid, and embedded structured content. Dedicated components render OpenAPI and SQL schemas. Source, Split, and Preview handle complex Markdown; the visual editor is gated when its round trip could lose syntax. See the [user guide](user-guide.md) for workflows.

## Backup and recovery boundaries

ZIP export snapshots library data and includes a versioned archive manifest with hashes. Import validates an archive and runs the same schema checks/migrations as library open before changing the target. An import journal supports interrupted-import recovery. Schema upgrades use a separate full filesystem backup outside the library tree (not limited by the UI ZIP ceiling). See [operations](operations.md).

## Development verification

Use `npm run check` for type checking and storage tests, `npm run test:core` for shared library tests, and `npm run test:cli` for CLI/agent-kit checks. UI and integration scripts have prerequisites in [operations](operations.md). Use temporary libraries. Documentation changes alone require content/link verification, not a production build.

## Bundled Help

`/help` and `/help/[slug]` use a separate read-only layout. The client shell does not mount the library workspace for these routes. A fixed allowlist in `scripts/build/prepare-help.mjs` converts repository Markdown into a generated JSON bundle before dev/build/typecheck. Article text and its search index stay local; unknown slugs return 404. Relative guide links are mapped to Help routes and image paths to `/help-assets/`.

The prepare step also copies `guides/assets/` into generated public assets. Docker copies the Markdown sources before building; the existing public/static copy steps carry the images into the runtime image. Do not edit the generated JSON or public copies. Edit the Markdown or original assets, then rerun the prepare step/build.
