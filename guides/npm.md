# Atlas Docs with npm

Requires Node.js 22.12 or newer. Once the package is published:

```sh
# Run immediately
npx atlas-docs@latest

# Or install for regular use
npm install -g atlas-docs
atlas-docs

# Check and update
atlas-docs update --check
atlas-docs update

# Installation and library status
atlas-docs doctor
```

`atlas-docs` with no subcommand is the same as `atlas-docs start`. Keep the terminal running; press Ctrl+C to stop.
The first npx run downloads the package and its production dependencies. No source checkout or build is needed.
Offline use works after the package is already installed; update checks never block opening the app.

## Library location

Default library: `atlas-docs-data` in the directory where you run the command.

Selection order:

1. `--data-dir`
2. `DATA_DIR`
3. Nearest `atlas-docs.config.json` walking up from the current directory
4. `./atlas-docs-data`

Relative `--data-dir` and `DATA_DIR` values resolve from the calling directory.
`dataDir` inside the config file resolves from the config file's directory.
A broken config or missing saved path is an error; the CLI does not silently create a different default library.
Passing `--data-dir` for one run does not rewrite project config.

```sh
atlas-docs library use ./project-docs
atlas-docs library info
atlas-docs --data-dir ./project-docs --port 3001 --no-open
atlas-docs start --yes
```

`--yes` confirms schema migration without a prompt (required in non-interactive environments).
`--help` and `--version` do not initialize a library.
The server listens only on `127.0.0.1`; default port 3000.

## Schema and locking

Libraries store an integer `schemaVersion` in `db.json` (currently **1**).
Older libraries without that field are legacy and migrate after confirmation, with a full backup outside the library tree. If a migration is interrupted, the next confirmed start recovers by restoring that full backup tree, then continues. The env var `ATLAS_TEST_MIGRATE_ABORT` exists only for automated crash tests and must not be set in normal use.
A library with a newer schema than the app is refused; files are not changed.
Only one Atlas Docs process may hold a library lock at a time. External editors are not blocked by that lock.

### Upgrading from 5.1.0

Package **5.1.0** has no `schemaVersion`, no shared prepare gate, and no cross-process library lock. Those protections cannot be applied retroactively to a running 5.1.0 process. After installing 5.2.0 or newer, open the same library once with confirmation (`atlas-docs --yes` when non-interactive) so migration and locking take effect. Keep the upgrade backup until you have verified documents and attachments.

## Connect an agent

Read the [agent guide](agent-guide.md) and [user guide](user-guide.md).
Add this to the source project's own `AGENTS.md`, adjusting the path to your actual library:

```markdown
## Project documentation
Before editing documentation, read ./atlas-docs-data/AGENTS.md
and ./atlas-docs-data/.atlas/guides/agent-guide.md.
Write project documents under ./atlas-docs-data/docs/.
Verify statements against this project's code and tests.
```

The CLI does not change instructions in other repositories. If the library already has an `AGENTS.md`,
it is preserved. When a managed guide changes, locally edited content is saved under `.atlas/backups/` before replacement.
Unrecognized files are preserved. Agent-kit sync runs only after the library is schema-compatible.
Direct document edits do not create app revision history.

## Updates

`atlas-docs update --check` reports the running version, latest stable (when reachable), detected install method, and how to update.
`atlas-docs update` applies an automatic update only when the install method is known and safe (for example npm global with the same prefix). Otherwise it prints the exact command and stops.
Package updates do not migrate every library on the machine; migration happens when that library is opened.
Stop the running app before replacing the installed package. Library data is not modified by a failed package update.

Background update notices use a local cache (at most once per 24 hours). Disable with `ATLAS_DOCS_NO_UPDATE_CHECK=1`. They are off in CI. Notices never upload library paths or document contents.

## Backup boundaries

App ZIP backups contain application data: `db.json`, `docs/`, `uploads/`, and `history/`.
They exclude `AGENTS.md` and `.atlas/`. Schema upgrades create a separate full filesystem backup outside the library.
Import into an empty library; generated guides do not prevent import. Backups with a schema newer than the app are refused before the target library changes.

## Source and Docker (different defaults)

This guide is for the npm package. A source checkout still defaults to repository `data/`. Docker still mounts `/data`. See [operations](operations.md). Do not assume npm CLI path rules apply to those entry points.

## Build and release (maintainers)

From a source checkout:

```sh
npm run setup
npm run check:distribution
npm run package:release
npm run test:package
npm run test:upgrade-artifacts
```

Packaging builds one `dist/atlas-docs-<version>.tgz` and `dist/atlas-docs-<version>.tgz.sha256`.
Build, test, and publish from your local machine; this repository has no CI workflow.
The package tests use temporary libraries. The upgrade test also uses the pinned
5.1.0 package in `scripts/fixtures/`; keep that directory as a test fixture.
Local tests verify only the operating system on which you run them.

After the checks pass, publish the tarball (replace `<version>` with the version in
`app/package.json`; do not publish the private root or app package):

```sh
npm login
npm publish ./dist/atlas-docs-<version>.tgz --access public
```
