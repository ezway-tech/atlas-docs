# Atlas Docs library

This directory is the library root. Write project documents under `docs/`.
Before editing, read [.atlas/guides/agent-guide.md](.atlas/guides/agent-guide.md)
and [.atlas/guides/user-guide.md](.atlas/guides/user-guide.md).
For launch and upgrade instructions, read [.atlas/guides/npm.md](.atlas/guides/npm.md).

Read the source project's own instructions and relevant code before documenting behavior.
Keep documents in simple English. Prefer updating existing articles. Verify links.
Do not edit `db.json`, `uploads/`, or `history/` by hand to simulate app operations.
Avoid simultaneous browser and filesystem edits. Direct file edits do not create app history.
Report which claims were checked in source, executed, or only proposed.

`.atlas/` contains generated guides and examples, not project documentation.
Its managed files may be updated by the CLI; edited copies are preserved in `.atlas/backups/`.
Keep personal instructions in this file, which the CLI will not overwrite.
App ZIP backups exclude this file and `.atlas/`; back up personal instructions separately.
