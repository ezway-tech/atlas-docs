# Architecture

[Documentation home](../README.md) · [Agent guide](agent-guide.md) · [Operations](operations.md)

Atlas Docs is a local Next.js application. React components provide the workspace; Node.js route handlers read and write a file-backed library. The interface is localized (vi, en, zh-Hans, es, ja) through message catalogs and a browser locale cookie; document content stays as authored. There is no authenticated multi-user write boundary; run it locally.

## Source map

| Location | Responsibility |
| --- | --- |
| `app/src/app/` | Next.js layout, page routes, CSS, and catch-all API route |
| `app/src/components/Workspace.tsx` | Main library navigation, reading, editing, search, and dialogs |
| `app/src/components/` | Markdown/OpenAPI/SQL viewers, visual/source editors, resource library, history and utility dialogs |
| `app/src/lib/store.ts` | Catalog scanning, folder/document operations, metadata access, revisions, and write coordination |
| `app/src/lib/data-root.ts` | Resolve the active library root |
| `app/src/lib/backup.ts` | ZIP import/export and manifest validation |
| `app/src/lib/asset-references.ts` | Reference scanning and cleanup eligibility |
| `app/src/lib/` | Shared types, history/backup policies, asset validation, parsing, and shortcuts |
| `app/src/lib/i18n/` | Locale detection, message catalogs, formatting helpers, and API error keys |
| `app/src/middleware.ts` | Sets the `atlas-locale` cookie from Accept-Language on first visit || `app/scripts/` | Initialization, demo seeding, and tests |
| `examples/little-cafe/` | Optional sample content copied into an empty library |

Paths in this table are relative to the repository root. The root package forwards npm commands into `app/`; dependencies are installed there.

The npm distribution adds a CLI in `cli/`, a library instruction template in `templates/`,
and release/test scripts in the root `scripts/`. `npm run package:release` generates
`dist/npm/` and a tarball. It copies the standalone runtime without build-machine dependencies;
npm installs production dependencies on the target platform. The CLI explicitly sets `DATA_DIR`
to the calling directory's `atlas-docs-data/` unless overridden, leaving source and Docker defaults unchanged.
Generated `.atlas/` guides come from `guides/`; library `AGENTS.md` comes from the template.
See [npm usage](npm.md) for package installation, agent discovery, and backup boundaries.

## Data model

`DATA_DIR`, when set, selects the library root. Otherwise it resolves to `../data` from the app working directory. Root npm commands run inside `app/`, so the normal default is the repository's `data/`. Prefer absolute custom paths.

| Library path | Contents |
| --- | --- |
| `docs/` | User Markdown, YAML, SQL, and JSON files, grouped in folders |
| `db.json` | Asset records, folder metadata, comments, navigation order, and settings |
| `uploads/` | Attachment bytes referenced by asset IDs |
| `history/` | Revision content and metadata; also the observed-content copies |

The catalog scans supported files and folders from disk. Markdown front matter supplies title, description, and order; other formats derive their title from the filename. Cached document entries use file modification time and size. Folder metadata enriches the directory tree with titles, icons, and cover images.

## Request and save flow

1. The workspace requests documents, folders, settings, and other library data through `/api/` routes.
2. The API validates inputs and delegates to storage or feature modules. Viewers render the resulting document according to its format.
3. Saving changed content through the app captures the previous content as a revision, writes the replacement through a temporary file, updates the observed copy, applies history limits, and invalidates the catalog entry. Saving identical content creates no revision.
4. Direct filesystem edits are found by later scans but bypass revision creation and server write coordination. Reload the browser to request fresh data.

Metadata writes and library mutations have in-process coordination. This is not cross-process locking: do not run multiple writers against the same data root or assume external file edits are serialized with UI saves.

## Rendering and editing

Markdown supports headings, tables, links, images, Mermaid, and embedded structured content. Dedicated components render OpenAPI and SQL schemas. Source, Split, and Preview handle complex Markdown; the visual editor is gated when its round trip could lose syntax. See the [user guide](user-guide.md) for workflows.

## Backup and recovery boundaries

ZIP export snapshots library data and includes a versioned manifest with hashes. Import validates an archive before installing it into an empty library; an import journal supports interrupted-import recovery. Storage scans and cleanup use references from current documents, retained history, comments, and folder covers. See [operations](operations.md) for exact limits and caveats.

## Development verification

Use `npm run check` for type checking and storage tests, then run feature-specific checks as appropriate. UI and integration scripts have prerequisites documented in [operations](operations.md). Use temporary libraries. Documentation changes alone require content/link verification, not a production build.

## Bundled Help

`/help` and `/help/[slug]` use a separate read-only layout. The client shell does not mount the library workspace for these routes. A fixed allowlist in `app/scripts/prepare-help.mjs` converts repository Markdown into a generated JSON bundle before dev/build/typecheck. Article text and its search index stay local; unknown slugs return 404. Relative guide links are mapped to Help routes and image paths to `/help-assets/`.

The prepare step also copies `guides/assets/` into generated public assets. Docker copies the Markdown sources before building; the existing public/static copy steps carry the images into the runtime image. Do not edit the generated JSON or public copies. Edit the Markdown or original assets, then rerun the prepare step/build.
