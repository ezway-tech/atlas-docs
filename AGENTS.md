# Agent instructions

## Choose the task

- **Maintain a user's project documentation:** read [guides/agent-guide.md](guides/agent-guide.md), then the source project's own instructions and relevant code. Write to the confirmed library's `docs/` directory (default: `data/docs/`).
- **Develop Atlas Docs:** read [guides/architecture.md](guides/architecture.md) and [guides/operations.md](guides/operations.md). Inspect the affected implementation and run checks appropriate to the change.
- **Explain the app:** consult [guides/user-guide.md](guides/user-guide.md) and verify behavior against source. Distinguish source inspection from executed verification.

## Shared rules

Keep guides and project documentation in simple English. Preserve existing user data and unrelated edits. `guides/` explains Atlas Docs; `data/docs/` holds user content. Do not replace one with the other.

Confirm the active data root before writing. Do not seed a nonempty library, delete data to permit import, or edit metadata/history/uploads by hand to simulate app operations. Avoid concurrent edits to the same document in the browser and on disk. Direct file edits do not create app history.

Prefer updating existing documentation over adding duplicates. Check links and paths. Do not describe planned features as implemented. Report what changed and which checks actually ran. Use temporary libraries for tests; never use the working library as a test fixture.

Do not modify a sibling source repository just because this repository sits beside it. Follow the user's task scope and that repository's instructions. For documentation-only changes, check content and links; builds and runtime tests are unnecessary unless behavior is in question.
