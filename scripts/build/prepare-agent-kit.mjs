import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {composeAgentKit} from './compose-agent-kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const {version} = JSON.parse(await readFile(path.join(root, 'app/package.json'), 'utf8'));
await composeAgentKit(path.resolve(process.argv[2] || path.join(root, 'app/agent-kit')), {
  guidesDir: path.join(root, 'guides'),
  examplesDir: path.join(root, 'examples/agent'),
  libraryAgents: path.join(root, 'scripts/templates/library-AGENTS.md'),
  version,
});
