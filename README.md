# Atlas Docs

A local library for Markdown, OpenAPI, YAML, and SQL. The interface is in Vietnamese. The sample library is in English.

```text
atlas-docs/
├── app/                  # Next.js app
├── examples/stockroom/   # Sample library, copied on first run
├── data/                 # Your library. Not committed
└── docker-compose.yml
```

Node.js 22.12 or newer.

```powershell
cd app
npm install
npm run dev
```

Open http://127.0.0.1:3000. The first start copies the Stockroom sample into `data/` when that folder has no documents and `db.json` has no folders. A library that already has content is left as it is.

Docker, from this folder:

```powershell
docker compose up -d --build
```

The container mounts `./data` and listens only on localhost. There is no login on the write API, so do not publish it on the internet.

Stockroom is a small warehouse web app: a stock list, a bar chart, a shelf map, an OpenAPI file, a YAML config, and a SQL schema. The Ops folder starts hidden. Show it again from the dashboard.
