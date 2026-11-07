import {cp, mkdir, readFile, writeFile, readdir, rm, chmod, mkdtemp, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run, npmArgs} from './process.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'app');
const output = path.join(root, 'dist/npm');
const buildDirectory = '.next-npm-release';
const manifest = JSON.parse(await readFile(path.join(app, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(app, 'package-lock.json'), 'utf8'));
const temporaryData = await mkdtemp(path.join(tmpdir(), 'atlas-package-build-'));
try {
  // Never let build-time route evaluation use the working library.
  await run(npmArgs(['run', 'build']), {cwd: app, env: {...process.env, DATA_DIR: temporaryData, ATLAS_DIST_DIR: buildDirectory, NEXT_TELEMETRY_DISABLED: '1'}});
  if (path.resolve(output) !== path.join(root, 'dist', 'npm')) throw Error('Invalid output directory');
  await rm(output, {recursive: true, force: true});
  await mkdir(output, {recursive: true});
  await cp(path.join(root, 'cli'), path.join(output, 'bin'), {recursive: true});
  await cp(path.join(app, 'scripts/bootstrap.mjs'), path.join(output, 'bin/bootstrap.mjs'));
  await chmod(path.join(output, 'bin/atlas-docs.mjs'), 0o755);
  const standalone = path.join(app, buildDirectory, 'standalone');
  // Copy only runtime output, never the build machine's node_modules or .env files.
  await mkdir(path.join(output, 'runtime'), {recursive: true});
  const server = await readFile(path.join(standalone, 'server.js'), 'utf8');
  await writeFile(path.join(output, 'runtime/server.js'), `// Stop if the CLI parent is terminated unexpectedly.\nif (process.send) process.on('disconnect', () => process.exit(0));\n${server}`);
  await cp(path.join(standalone, buildDirectory), path.join(output, 'runtime', buildDirectory), {
    recursive: true, filter: source => !source.endsWith('.nft.json') && path.basename(source) !== 'node_modules',
  });
  await cp(path.join(app, buildDirectory, 'static'), path.join(output, 'runtime', buildDirectory, 'static'), {recursive: true});
  await cp(path.join(app, 'public'), path.join(output, 'runtime/public'), {recursive: true});
  // CommonJS scope for Next's generated server.js.
  await writeFile(path.join(output, 'runtime/package.json'), JSON.stringify({private: true, type: 'commonjs'}));
  // Browser/editor packages are already compiled into the runtime. Only direct
  // production dependencies retained by Next's trace need an npm installation.
  const external = [];
  for (const name of Object.keys(manifest.dependencies)) {
    try { await access(path.join(standalone, 'node_modules', name, 'package.json')); external.push(name); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const required of ['next', 'react', 'react-dom']) if (!external.includes(required)) throw Error(`Missing runtime dependency in trace: ${required}`);
  const dependencies = Object.fromEntries(external.map(name => {
    const version = lock.packages[`node_modules/${name}`]?.version;
    if (!version) throw Error(`Missing locked dependency: ${name}`);
    return [name, version];
  }));
  await writeFile(path.join(output, 'package.json'), JSON.stringify({
    name: 'atlas-docs', version: manifest.version, description: 'Local project documentation workspace with Markdown, OpenAPI and SQL viewers',
    license: 'MIT', engines: manifest.engines, bin: {'atlas-docs': 'bin/atlas-docs.mjs'},
    files: ['bin/', 'runtime/', 'agent-kit/', 'README.md', 'LICENSE'], dependencies,
    publishConfig: {access: 'public'},
  }, null, 2) + '\n');
  await cp(path.join(root, 'LICENSE'), path.join(output, 'LICENSE'));
  const kit = path.join(output, 'agent-kit');
  await mkdir(kit, {recursive: true});
  await cp(path.join(root, 'guides'), path.join(kit, 'guides'), {recursive: true});
  await cp(path.join(root, 'examples/agent'), path.join(kit, 'examples'), {recursive: true});
  await cp(path.join(root, 'templates/library-AGENTS.md'), path.join(kit, 'library-AGENTS.md'));
  await writeFile(path.join(kit, 'AGENTS.md'), '# Generated reference material\n\nRead [guides/agent-guide.md](guides/agent-guide.md). Write project documents in the library docs directory, not here.\n');
  await writeFile(path.join(kit, 'README.md'), '# Atlas Docs reference\n\n[Agent guide](guides/agent-guide.md) · [User guide](guides/user-guide.md) · [npm usage](guides/npm.md)\n\nThe CLI manages this directory. Keep personal instructions in the library AGENTS.md.\n');
  const agentFile = path.join(kit, 'guides/agent-guide.md');
  let agent = await readFile(agentFile, 'utf8');
  agent = agent.replace(/## Connect the source repository[\s\S]*?## Where content belongs/, `## Connect the source repository\n\nThis guide is installed under the library's .atlas directory. The library root is two directories above this file; documents belong in its docs directory. Read the library AGENTS.md first.\n\nAgents working in another repository do not automatically discover these instructions. Add a link to the library AGENTS.md in that repository's instructions; see [npm usage](npm.md#connect-an-agent).\n\nConfirm the absolute library and source project paths before writing.\n\n## Where content belongs`);
  agent = agent.replaceAll('data/docs/', 'docs/').replace('The default `data/` is ignored by this repository\'s Git configuration.', 'The npm CLI does not modify your Git configuration. Choose what to track explicitly.');
  await writeFile(agentFile, agent);
  // Operations also documents source/Docker workflows. The npm guide takes precedence for installed packages.
  const operations = path.join(kit, 'guides/operations.md');
  await writeFile(operations, (await readFile(operations, 'utf8')).replace('# Operations guide', '# Operations guide\n\nFor an npm installation, use [npm usage](npm.md) for launch, data paths, and upgrades. Commands described as running from the repository require a source checkout; they are not package commands.'));
  await writeFile(path.join(output, 'README.md'), (await readFile(path.join(root, 'guides/npm.md'), 'utf8')).replaceAll('(agent-guide.md)', '(agent-kit/guides/agent-guide.md)').replaceAll('(user-guide.md)', '(agent-kit/guides/user-guide.md)'));
  const files = {};
  async function scan(dir, prefix = '') {
    for (const entry of await readdir(dir, {withFileTypes: true})) {
      const relative = prefix + entry.name;
      if (relative === 'library-AGENTS.md') continue; // Installed at the library root, not inside .atlas.
      if (entry.isDirectory()) await scan(path.join(dir, entry.name), relative + '/');
      else files[relative] = createHash('sha256').update(await readFile(path.join(dir, entry.name))).digest('hex');
    }
  }
  await scan(kit);
  await writeFile(path.join(kit, 'manifest.json'), JSON.stringify({format: 'atlas-agent-kit', version: manifest.version, files}, null, 2) + '\n');
  await run(npmArgs(['pack', '--silent', '--pack-destination', path.join(root, 'dist')]), {cwd: output});
  console.log(`[Atlas Docs] Package ready: dist/atlas-docs-${manifest.version}.tgz`);
} finally {
  await rm(temporaryData, {recursive: true, force: true});
}
