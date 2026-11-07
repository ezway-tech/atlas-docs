/**
 * Build agent-kit content with structured overlays instead of fragile whole-file regex edits.
 * Source guides stay the source of truth; npm overlays replace named sections.
 */
import {readFile, writeFile, mkdir, cp, readdir} from 'node:fs/promises';
import path from 'node:path';

const CONNECT_SOURCE_NPM = `## Connect the source repository

This guide is installed under the library's .atlas directory. The library root is two directories above this file; documents belong in its docs directory. Read the library AGENTS.md first.

Agents working in another repository do not automatically discover these instructions. Add a link to the library AGENTS.md in that repository's instructions; see [npm usage](npm.md#connect-an-agent).

Confirm the absolute library and source project paths before writing. Run \`atlas-docs library info\` and \`atlas-docs doctor\` before bulk edits. Do not write into a library until its schema is compatible with this app version.
`;

const FILE_PATH_NPM_NOTE = `The npm CLI does not modify your Git configuration. Choose what to track explicitly. Prefer the library \`docs/\` directory (not a repository \`data/docs/\` path).`;

const OPERATIONS_NPM_BANNER = `# Operations guide

For an npm installation, use [npm usage](npm.md) for launch, data paths, upgrades, \`atlas-docs update\`, and \`atlas-docs doctor\`. Commands described as running from the repository require a source checkout; they are not package commands.
`;

/** Replace a markdown section from a heading through (not including) the next same-level heading. */
export function replaceSection(markdown, heading, replacement) {
  const pattern = new RegExp(`^${escapeReg(heading)}\\r?\\n[\\s\\S]*?(?=\\r?\\n## |$)`, 'm');
  if (!pattern.test(markdown)) throw new Error(`Missing section: ${heading}`);
  return markdown.replace(pattern, `${replacement.trim()}\n\n`);
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function composeAgentKit(kitDir, {guidesDir, examplesDir, libraryAgents, version}) {
  await mkdir(kitDir, {recursive: true});
  await cp(guidesDir, path.join(kitDir, 'guides'), {recursive: true});
  await cp(examplesDir, path.join(kitDir, 'examples'), {recursive: true});
  await cp(libraryAgents, path.join(kitDir, 'library-AGENTS.md'));

  await writeFile(
    path.join(kitDir, 'AGENTS.md'),
    '# Generated reference material\n\nRead [guides/agent-guide.md](guides/agent-guide.md). Write project documents in the library docs directory, not here.\n',
  );
  await writeFile(
    path.join(kitDir, 'README.md'),
    '# Atlas Docs reference\n\n[Agent guide](guides/agent-guide.md) · [User guide](guides/user-guide.md) · [npm usage](guides/npm.md)\n\nThe CLI manages this directory. Keep personal instructions in the library AGENTS.md.\n',
  );

  const agentFile = path.join(kitDir, 'guides/agent-guide.md');
  let agent = await readFile(agentFile, 'utf8');
  agent = replaceSection(agent, '## Connect the source repository', CONNECT_SOURCE_NPM);
  agent = agent.replaceAll('data/docs/', 'docs/');
  agent = agent.replace(
    'The default `data/` is ignored by this repository\'s Git configuration.',
    FILE_PATH_NPM_NOTE,
  );
  // Append CLI / compatibility notes for packaged kits.
  if (!agent.includes('## CLI and library compatibility')) {
    agent += `

## CLI and library compatibility

Packaged CLI commands that exist in this release: \`atlas-docs\` / \`atlas-docs start\`, \`atlas-docs library use|info\`, \`atlas-docs doctor\`, \`atlas-docs update [--check]\`.

Before editing library files directly, run \`atlas-docs library info\` (or open the library once) and confirm the schema matches this app. Do not invent a second library when a configured path is broken. Direct disk edits do not create app revision history. Import, backup, schema migration, and agent-kit sync go through the app or CLI prepare pipeline.
`;
  }
  await writeFile(agentFile, agent);

  const operations = path.join(kitDir, 'guides/operations.md');
  let ops = await readFile(operations, 'utf8');
  if (ops.startsWith('# Operations guide\n')) {
    ops = ops.replace('# Operations guide\n', `${OPERATIONS_NPM_BANNER}\n`);
  } else {
    ops = `${OPERATIONS_NPM_BANNER}\n${ops}`;
  }
  await writeFile(operations, ops);

  return {version};
}
