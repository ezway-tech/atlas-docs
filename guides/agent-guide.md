# Agent guide

[Documentation home](../README.md) · [User guide](user-guide.md) · [Operations](operations.md)

Use this guide when maintaining a project's documentation in Atlas Docs. For changes to Atlas Docs itself, read the [architecture guide](architecture.md).

## Connect the source repository

Default arrangement:

```text
workspace/
  my-product/
    AGENTS.md
  atlas-docs/
    AGENTS.md
    guides/agent-guide.md
    data/docs/
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
```

Replace the paths if the repositories have other names or the library uses `DATA_DIR`. These paths are relative to the source repository root. Resolve them to absolute paths before writing. If the configured data root cannot be established, ask which library to use rather than creating a second one.

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

Before bulk disk edits, confirm the library path and schema compatibility (`atlas-docs library info`, `atlas-docs doctor`, or by opening the library once). Do not create a second library because a configured path is broken. Do not treat `.atlas/` guide manifests as the data schema. Schema compatibility comes from `db.json` `schemaVersion`.

## History and backups

Direct file edits are discovered by catalog scans, but do not call the app save operation and do not create app revision history. Use Git for text change history or the app's editing flow when app revisions are required. Avoid simultaneous browser and agent edits, which can overwrite changes.

The default `data/` is ignored by this repository's Git configuration. For a separate versioned document repository, follow [Version project documents with Git](operations.md#version-project-documents-with-git). `DATA_DIR` points to the library root, not its `docs/` subdirectory. Text-only Git history is not a replacement for a complete library backup.
