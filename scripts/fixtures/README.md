# Release artifacts (test fixtures)

Pinned published-shape tarballs used for cross-version upgrade tests.

| File | Role |
| --- | --- |
| `atlas-docs-5.1.0.tgz` | Baseline npm package before schemaVersion / prepare / cross-process lock |
| `atlas-docs-5.1.0.tgz.sha256` | SHA-256 of that tarball (`hash  filename`) |

`npm run test:upgrade-artifacts` verifies the checksum and fails if the file is missing or altered.
These fixtures are not published to npm from this directory.

The 5.1.0 fixture is sanitized: build-machine repository paths in generated
JavaScript and JSON are replaced with `C:/atlas-build/atlas-docs`. Its version
and application logic are unchanged, but its bytes and checksum differ from
the original artifact. Keep this fixture local to the repository; do not
substitute a registry download. The upgrade test checks both its checksum and
the absence of personal home paths before installation.
