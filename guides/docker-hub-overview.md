# Atlas Docs

**Keep your project docs organized, readable, and close to your code.**

Atlas Docs is a local documentation library for browsing, editing, and searching project knowledge. Keep guides, API references, database schemas, and attachments together in a browser interface — with the library stored on your own machine.

[Website](https://atlasdocs.ezway.tech/) · [GitHub](https://github.com/ezway-tech/atlas-docs) · [npm](https://www.npmjs.com/package/atlas-docs) · [Donate](https://atlasdocs.ezway.tech/donate/)

![Atlas Docs with a folder tree, document reader, and table of contents](https://raw.githubusercontent.com/ezway-tech/atlas-docs/main/guides/assets/originals/overview.png)

*The Example project (Little Café content). First launch prepares one durable Example project in Projects.*

## Features

- Read and write Markdown with Visual, Source, Split, and Preview modes
- Mermaid diagrams, OpenAPI and SQL schema viewers, plus YAML and JSON source views
- Search documents and comments, browse folders, pin favorites, and use a table of contents
- Comments, attachments, and revision history saved through the app
- Light and dark themes, customizable keyboard shortcuts, and UI languages: English, Vietnamese, Simplified Chinese, Spanish, and Japanese

![Atlas Docs visual editor with formatting tools and Visual, Source, Split, and Preview modes](https://raw.githubusercontent.com/ezway-tech/atlas-docs/main/guides/assets/originals/editing.png)

## Get started

No source checkout or local Node.js install is required. You only need Docker with Docker Compose.

Save the following as `compose.yaml` (or copy [`docker-compose.hub.yml`](https://github.com/ezway-tech/atlas-docs/blob/main/docker-compose.hub.yml) from the repository):

```yaml
services:
  atlas-docs:
    image: ezwaytechvn/atlas-docs:${ATLAS_DOCS_VERSION:-6.2.0}
    ports:
      - "127.0.0.1:${ATLAS_DOCS_PORT:-17430}:3000"
    environment:
      ATLAS_LIBRARIES_ROOT: /libraries
      ATLAS_DOCS_LIBRARIES_DIR: /libraries
      ATLAS_DOCS_REGISTRY_DIR: /atlas-registry
      ATLAS_DOCS_ALLOWED_ROOTS: /libraries
      ATLAS_DOCS_UPGRADE_BACKUP_DIR: /upgrade-backups
      NODE_ENV: production
    volumes:
      - atlas-docs-libraries:/libraries
      - atlas-docs-registry:/atlas-registry
      - atlas-docs-upgrade-backups:/upgrade-backups
    restart: unless-stopped

volumes:
  atlas-docs-libraries:
  atlas-docs-registry:
  atlas-docs-upgrade-backups:
```

Start:

```sh
docker compose up -d
```

Open **http://127.0.0.1:17430**. Override the host port with `ATLAS_DOCS_PORT`. Pin a release with `ATLAS_DOCS_VERSION` when using the repository Compose file.

> **Local use:** Atlas Docs does not provide authentication for its write API. Keep the localhost port binding shown above; do not expose the app directly to the internet or an untrusted network.

### Different host port

Create a `.env` next to `compose.yaml`:

```dotenv
ATLAS_DOCS_PORT=17431
```

Run `docker compose up -d` again, then open **http://127.0.0.1:17431**. The container listen port remains `3000`.

### One Projects workflow

npm, source, and Docker all open Projects. First launch creates only Example; create or open your own project from that screen. Example edits and the project list survive container recreation when all standard volumes are retained. Optional `ATLAS_OPEN_LIBRARY` selects an existing project without disabling switching.

Upgrading from the old `/data` configuration requires removing `DATA_DIR` and mounting the old complete library under `/libraries/<project>`. Nothing is moved or deleted automatically. Follow the [migration instructions](https://github.com/ezway-tech/atlas-docs/blob/main/guides/operations.md#upgrade-from-the-old-fixed-data-layout).

## Before an agent generates documents

Create the project in Atlas **before** adding documents. Atlas creates the required database and storage folders:

```text
/libraries/my-project/       # Selected project inside the container
  db.json                    # Required metadata; created and managed by Atlas
  uploads/                   # Attachments managed by Atlas
  history/                   # Revisions managed by Atlas
  docs/
    overview/
      getting-started.md     # Agent-authored document, added after initialization
```

Check container readiness, then confirm these paths exist. An agent must not hand-author `db.json` or create `docs/` before initialization: a directory with `docs/` but no database is refused. Preserve existing files and use the [agent guide's initialization and recovery steps](https://github.com/ezway-tech/atlas-docs/blob/main/guides/agent-guide.md#initialize-before-writing). The guide is also available as [raw Markdown](https://raw.githubusercontent.com/ezway-tech/atlas-docs/main/guides/agent-guide.md); use the matching release tag instead of `main` when needed.

The default Compose uses a **named volume**, not a host `./data` directory. For a host agent, configure a bind mount to the confirmed library root or use authorized access inside the container. Do not write to a guessed host folder. Select the individual project root under the mounted allowed roots, not `/libraries` itself.

Write supported files under `docs/<folder>/` (at most three folder levels). Atlas discovers them without database registration. Stop the container before bulk disk edits, restart it, and verify the documents appear. Add the agent-guide link and the exact library path to the source project's `AGENTS.md`; agents do not automatically discover sibling instructions.

## Your library stays with you

- **`/libraries`** stores individual projects with documents, attachments, comments, settings, and revision history.
- **`/atlas-registry`** stores the project list and Example identity.
- **`/upgrade-backups`** stores full library backups created during schema upgrades.
- ZIP export and restore are available in the app under **Utilities → Backup & restore**. Restore requires an empty target library.

Keep all three volumes when replacing or updating the container. Do not run `docker compose down -v` unless you intend to delete the library volumes.

On Linux bind mounts, if the app cannot write, `chown` host directories to UID **1000** (the image `node` user).

## Updating

Back up volumes or export a ZIP first. Change the image tag to the release you want (or set `ATLAS_DOCS_VERSION`), then:

```sh
docker compose pull
docker compose up -d
```

Use a version tag such as `6.2.0` for predictable updates, or `latest` to follow the latest published image.

An older image may not support a library upgraded by a newer release. If the library schema changed, rolling back also requires a compatible backup.

Readiness: the image HEALTHCHECK calls `GET /api/health`.

## Learn more

Built-in Help is available from the app (Guides, release notes, version details).

- [Source and documentation](https://github.com/ezway-tech/atlas-docs)
- [Report an issue](https://github.com/ezway-tech/atlas-docs/issues)
- [Image tags](https://hub.docker.com/r/ezwaytechvn/atlas-docs/tags)

Atlas Docs is open-source software released under the **MIT License**.
