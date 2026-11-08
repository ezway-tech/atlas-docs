# Release artifacts (test fixtures)

Pinned published-shape tarballs used for cross-version upgrade tests.

| File | Role |
| --- | --- |
| `atlas-docs-5.1.0.tgz` | Baseline npm package before schemaVersion / prepare / cross-process lock |
| `atlas-docs-5.1.0.tgz.sha256` | SHA-256 of that tarball (`hash  filename`) |

`npm run test:upgrade-artifacts` verifies the checksum and fails if the file is missing or altered.
These fixtures are not published to npm from this directory.
