# Agent guide

[Documentation home](../README.md) · [User guide](user-guide.md) · [Operations](operations.md)

Use this guide when maintaining a project's documentation in Atlas Docs. For changes to Atlas Docs itself, read the [architecture guide](architecture.md).

## Connect the source repository

Source-checkout example with a confirmed project folder (not a universal default):

```text
workspace/
  my-product/
    AGENTS.md
  atlas-docs/
    AGENTS.md
    guides/agent-guide.md
    data/
      db.json
      uploads/
      history/
      docs/
```

The user can add this section to `my-product/AGENTS.md`. Do not assume agents in that repository automatically read sibling instructions.

```markdown
## Project documentation
Project documentation is maintained in ../atlas-docs/data/docs.
Before changing documentation, read ../atlas-docs/AGENTS.md
and ../atlas-docs/guides/agent-guide.md.
Update affected documentation when changing documented behavior.
Verify behavior against this project's source and tests.
Write documentation in simple English.
Confirm the library is initialized before writing documents.
Let Atlas create db.json; do not hand-author it.
```

Replace the paths if the repositories have other names or the selected project lives elsewhere. These paths are relative to the source repository root. Resolve them to absolute paths before writing. If the configured data root cannot be established, ask which library to use rather than creating a second one.

## Initialize before writing

An Atlas Docs library is a complete data directory, not just a tree of Markdown files. Select the parent containing `db.json` and `docs/` when opening a project.

```text
<library>/
  db.json                   # Required; Atlas creates and manages this file
  uploads/                  # Atlas-managed attachment bytes
  history/                  # Atlas-managed revisions and observed copies
  docs/                     # Agent-authored content
    overview/
      getting-started.md
  AGENTS.md                 # Installed by the npm agent-kit when absent
  .atlas/                   # Generated reference guides when a kit is installed
```

`db.json` stores `schemaVersion` (currently 1), assets, folder metadata, comments, navigation order, and settings. It is not a list of document bodies. Atlas scans valid files and folders under `docs/`; agents do not need to register each new document in the database. The app manages uploads and history. `AGENTS.md` and `.atlas/` are guidance, not replacements for the database.

1. Confirm the absolute library path, installation method, and installed app version. Use the guides bundled with that version when available; online `main` can describe newer behavior. Never assume a sibling `data/` is the active library.
2. For an existing library, open it in Atlas or inspect it with `atlas-docs doctor --data-dir "<absolute-library-path>"` when the CLI is installed. Confirm the printed path and a compatible schema. A damaged or unrecognized directory is not a new empty library.
3. For a new library, initialize the confirmed missing or empty directory using one of the methods below. Do this **before creating even an empty `docs/` directory**. Wait for successful initialization and check that `db.json`, `docs/`, `uploads/`, and `history/` exist.
4. Only then create documents such as `docs/overview/getting-started.md`, following the file rules below. Reload Atlas and check that the document appears. If runtime access is unavailable, report that visibility has not been verified.

### Initialization methods

- **npm/npx:** run `npx atlas-docs@latest --data-dir "<absolute-library-path>" --no-open` (or use the installed `atlas-docs` command). Replace the placeholder with the confirmed path. This starts a server and initializes a missing or empty explicit target. Wait for Ready; stop with Ctrl+C before bulk external edits. There is no `atlas-docs init` command; `library use` selects a path, not an initialization operation.
- **Source checkout:** run `npm run setup`, then `npm run dev` from the repository root. Create or open the project in Projects and confirm its absolute path. For an existing project, `ATLAS_OPEN_LIBRARY` may select it at startup. The maintenance command `npm run bootstrap` can initialize an explicit empty `DATA_DIR`; unset that variable before launching the app.
- **Docker:** use the standard Compose, open Projects, and create a project under `/libraries`. Atlas initializes that individual project folder. A host agent needs its corresponding host bind-mount path or authorized container access; a named volume is not a local `./data` folder. Persist `/libraries`, `/atlas-registry`, and `/upgrade-backups`. See [Docker operations](operations.md#docker).
- **App UI:** create a project, or initialize an empty folder through the project manager. Confirm the selected project directory before handing it to an agent.

### Missing database or unrecognized folder

If `docs/` already exists but `db.json` is missing, the library inspector rejects the directory with `Directory has files but no db.json.` Even an empty manually created `docs/` can trigger this. Re-running startup or adding `--yes` does not convert that directory into a valid library.

Preserve the existing files. If this was a working Atlas library, recover its complete backup; an invented database cannot recover attachment records, comments, or settings. If these are ordinary documents, open the selected folder directly in Atlas 6.2 or later. For an in-place project (`layout: atlas-folder-v1`), edit documents at their original relative paths. Keep the originals and verify links and document visibility. Do not silently switch the configured library, delete files to make it look empty, or copy an unrelated `db.json` from a demo.

A folder of generated documents is not an Atlas backup ZIP. Do not promise it can be restored through Backup & restore; that flow expects an app backup with database and manifest. If Atlas cannot be run, deliver the text files with explicit initialization instructions and state that the library is not ready to open.

## Where content belongs

| Content | Folder under the active library's `docs/` |
| --- | --- |
| Purpose, setup, and first steps | `overview/` |
| Components, data flow, and design decisions | `architecture/` |
| User-facing behavior and feature workflows | `features/` |
| Endpoints, contracts, and OpenAPI files | `api/` |
| Deployment, backups, incidents, and recovery | `operations/` |

These are a recommended convention, not folders automatically created by the app. Create only the folders needed for the task. `guides/` is for Atlas Docs instructions, never the user's product documentation.

## File and path rules

- Documents must be inside at least one folder under `docs/`; files directly in `docs/` are not cataloged. Use at most three folder levels, such as `docs/operations/deploy/local.md`.
- Supported extensions are `.md`, `.yml`, `.yaml`, `.sql`, and `.json`. Use lowercase extensions. OpenAPI is detected from suitable YAML/JSON content; it is not a separate file extension.
- Folder names and file stems must begin with a lowercase ASCII letter or digit. Remaining characters may be lowercase ASCII letters, digits, spaces, underscores, or hyphens. Prefer lowercase hyphenated names such as `getting-started.md`; no extra dots in a file stem.
- Hidden entries and symbolic links are skipped. Do not use symlinks to connect the source repository to the library.
- A Markdown document ID omits `.md`: `overview/getting-started`. Other formats keep the extension: `api/openapi.yml`. Browser routes use `/docs/` followed by this ID.
- Use UTF-8. Markdown supports optional YAML front matter with `title`, `description`, and numeric `order`. Prefer positive order values; saved UI ordering can take precedence over these values.

## Document template

For `data/docs/overview/getting-started.md` (create the linked overview article only if it is needed):

```markdown
---
title: Getting started
description: Run the project locally and verify the result.
order: 10
---

# Getting started

## Before you begin
List the prerequisites verified against the project source.

## Steps
1. Give an exact command and its working directory.
2. Describe the expected result.

## Verify the result
Explain how to confirm success.

## Troubleshooting
Describe known failures and recovery steps.

## Related documentation
[System overview](../architecture/system-overview.md)
```

Replace placeholders with verified instructions before delivery. Only link to files that exist. Use relative Markdown links between documents, including their file extensions. For images, use the app's upload/insert flow and retain its generated media link; copying files into `uploads/` does not register them.

## Workflow

1. Read the source project's instructions and existing documentation. Confirm the task, repository paths, and active library root.
2. Inspect relevant implementation, configuration, and tests. Record whether a claim was read in code, tested, or merely proposed. Do not infer production behavior from a name alone.
3. Locate and update the existing article before creating another. Choose the folder from the table above and keep each article focused on one topic or procedure.
4. Coordinate edits: finish or discard browser drafts before modifying the same file externally. For bulk file edits, stop the app where practical. Do not rely on file edits participating in the server's write locks.
5. Edit text documents only within the authorized scope. Do not hand-edit `db.json`, `history/`, or `uploads/` to mimic UI operations. Renames, moves, and deletes can affect links, comments, and history; treat them as a separate migration, not a routine rewrite.
6. Check front matter, supported paths, links, and examples. Reload the app after external edits and confirm the document appears when runtime verification is available. Do not claim this check ran if only the source was inspected.
7. Report the files changed, checks performed, and remaining uncertainty. Never claim a command or feature works solely because the documentation says so.

## CLI and library compatibility

When using the npm package, available commands include `atlas-docs` / `atlas-docs start`, `atlas-docs library use|info`, `atlas-docs doctor`, and `atlas-docs update [--check]`. Confirm which commands exist in the installed version before documenting them as required steps.

Before bulk disk edits, confirm the library path and schema compatibility (`atlas-docs library info`, `atlas-docs doctor`, or by opening the library once). Do not create a second library because a configured path is broken. Do not treat `.atlas/` guide manifests as the data schema. Schema compatibility comes from `db.json` `schemaVersion`. Opening or switching libraries in the UI does not rewrite `atlas-docs.config.json`; use `atlas-docs library use` when a project should pin a path. Recent libraries are machine-local and separate from project config.

## History and backups

Direct file edits are discovered by catalog scans, but do not call the app save operation and do not create app revision history. Use Git for text change history or the app's editing flow when app revisions are required. Avoid simultaneous browser and agent edits, which can overwrite changes.

The default `data/` is ignored by this repository's Git configuration. For a separate versioned document repository, follow [Version project documents with Git](operations.md#version-project-documents-with-git). Select the project root, not its `docs/` subdirectory. Text-only Git history is not a replacement for a complete library backup.
