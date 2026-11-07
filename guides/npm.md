# Atlas Docs with npm

Requires Node.js 22.12 or newer. Once the package is published:

```sh
npx atlas-docs
```

This starts a local server and opens your browser. Keep the terminal running; press Ctrl+C to stop.
The first run downloads the package and its production dependencies. No source checkout or build is needed.

## Library location

The default library is `atlas-docs-data` in the directory where you run the command.
Running from another directory selects another default library. The CLI prints the absolute location.

```sh
npx atlas-docs --data-dir ./project-docs --port 3001 --no-open
```

The library selection order is `--data-dir`, then `DATA_DIR`, then `./atlas-docs-data`.
Relative paths resolve from the calling directory. Point to the library root, not its `docs` subdirectory.
The server listens only on `127.0.0.1`; default port 3000. A busy port is an error; select another with `--port`.
`--no-open` disables browser opening. `--help` and `--version` do not initialize a library.
Do not run multiple servers against the same library; write coordination is within one process only.

The library contains `docs/`, `db.json`, `uploads/`, and `history/`. Startup only creates missing storage.
It also creates `AGENTS.md` if absent and maintains reference material under `.atlas/`.
No demo content is inserted. Small syntax examples are in `.atlas/examples/`; they are not cataloged documents.
The package cache is disposable; your separate library is not.

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
it is preserved; add the suggested guide link yourself. Personal rules belong there, not in generated guides.
When a managed guide changes, locally edited content is saved under `.atlas/backups/` before replacement.
Unrecognized files are preserved. Direct document edits do not create app revision history.

## Install globally and update

```sh
npm install -g atlas-docs
atlas-docs --data-dir ./project-docs
```

Stop the running app and back up the library before upgrading. Use `npx atlas-docs@latest` or
`npm install -g atlas-docs@latest`, then restart with the same library path.
For a fixed release, use `npx atlas-docs@<version>`. Review release notes before updating.
Guide versions are recorded in `.atlas/manifest.json`. Existing personal instructions are never overwritten.

App ZIP backups contain application data only: `db.json`, `docs/`, `uploads/`, and `history/`.
They exclude `AGENTS.md` and `.atlas/`, including saved guide edits. Back up personal instructions separately,
or copy the whole library with the app stopped. Standard guides are recreated by the CLI.
Import into a library with no application content; the generated guides do not prevent import.

## Build and release (maintainers)

From a source checkout, install dependencies with `npm run setup`, then:

```sh
npm run check
npm run test:cli
npm run package:release
npm run test:package
```

Packaging builds the app with a temporary library, writes `dist/npm/`, and creates
`dist/atlas-docs-<version>.tgz`. The version comes from the app manifest.
Only production runtime output, CLI, guides, examples, and license are distributed.
Only external runtime dependencies retained by the build trace are installed by npm on the user's platform.
Editor/viewer code is already compiled into the runtime; native binaries from the build machine are not bundled.

Before publication, test the tarball locally:

```sh
npm exec --package ./dist/atlas-docs-<version>.tgz -- atlas-docs --data-dir ./test-library
```

CI builds one tarball and tests that same artifact on Windows, Linux, and macOS.
After reviewing those results, use your authorized npm account to publish the tested tarball:

```sh
npm login
npm publish ./dist/atlas-docs-<version>.tgz --access public
```

Publication is manual. Check package-name ownership and choose an unused version before publishing.
Source-checkout and Docker commands keep their existing data defaults.
