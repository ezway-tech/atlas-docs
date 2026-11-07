# Atlas Docs

A local library for Markdown, OpenAPI, YAML, SQL, and JSON, with editing, search, attachments, comments, and revision history. The app interface supports Vietnamese, English, Simplified Chinese, Spanish, and Japanese. Choose the language under **Utilities → Language**; the choice is stored in a browser cookie and does not change library data. These guides and the optional Little Café demo are in English.

## Quick start

Requires Node.js **22.12 or newer**. Run from this repository root:

```powershell
npm run setup
npm run bootstrap
npm run dev
```

Open http://127.0.0.1:3000. Bootstrap creates an empty library without replacing existing data and runs automatically before dev/start. For production, use `npm run build`, then `npm start`.

Or run with Docker:

```powershell
docker compose up -d --build
```

Docker stores data in `./data` and exposes http://127.0.0.1:3000. There is no login on the write API; keep the application local.

## Use alongside your project

```text
workspace/
  my-product/                 # Your application source
    AGENTS.md                 # Points agents to the documentation instructions
  atlas-docs/
    AGENTS.md                 # Entry point for agents
    guides/                   # Instructions about Atlas Docs itself
    data/docs/                # Your project's documents
      overview/
      architecture/
      features/
      api/
      operations/
```

Write project documents under `data/docs/`, not `guides/`. Follow the [agent guide](guides/agent-guide.md) for file rules, a document template, and instructions to add to your project's AGENTS.md. Agents working in a sibling repository should not be assumed to discover this repository's instructions automatically.

## Documentation

| Read this | For |
| --- | --- |
| [User guide](guides/user-guide.md) | Reading, organizing, editing, resources, comments, and history |
| [Agent guide](guides/agent-guide.md) | Maintaining project documentation from source evidence |
| [Architecture](guides/architecture.md) | Source layout and how the application stores and renders data |
| [Operations](guides/operations.md) | Install, demo, Docker, updates, backups, limits, troubleshooting, and command reference |
| [Agent entry point](AGENTS.md) | Rules for agents working in this repository |

## Where your data lives

The default library is `data/` beside `app/`: documents in `docs/`, attachments in `uploads/`, revisions in `history/`, and metadata in `db.json`. `data/` is ignored by Git. Set an absolute `DATA_DIR` to use another library; see [operations](guides/operations.md) for a separate documentation repository and full backup instructions.

## Source layout

- `app/src/app/`: Next.js routes, layout, styles, and HTTP API.
- `app/src/components/`: workspace, editors, viewers, and dialogs.
- `app/src/lib/`: file storage, metadata, history, backup, and validation.
- `app/scripts/`: bootstrap, demo seeding, and verification scripts.
- `examples/little-cafe/`: optional sample library; [demo image prompts](guides/demo-image-prompts.md) are documented under `guides/`.

## Development

Run `npm run check` for TypeScript and storage checks. Run `npm run build` to verify the production build. The [operations guide](guides/operations.md) lists all commands, integration test prerequisites, and the separate backup load test. Tests should use temporary libraries, not your working data.
