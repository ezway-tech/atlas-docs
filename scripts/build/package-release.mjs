import {cp, mkdir, readFile, writeFile, readdir, rm, chmod, mkdtemp, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run, npmArgs} from './process.mjs';
import {composeAgentKit} from './compose-agent-kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = path.join(root, 'app');
const output = path.join(root, 'dist/npm');
const buildDirectory = '.next-npm-release';
const manifest = JSON.parse(await readFile(path.join(app, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(app, 'package-lock.json'), 'utf8'));
const temporaryData = await mkdtemp(path.join(tmpdir(), 'atlas-package-build-'));
try {
  // Never let build-time route evaluation use the working library.
  await run(npmArgs(['run', 'build']), {
    cwd: app,
    env: {
      ...process.env,
      DATA_DIR: temporaryData,
      ATLAS_DIST_DIR: buildDirectory,
      ATLAS_DOCS_MIGRATE_YES: '1',
      ATLAS_CORE_PATH: path.join(app, 'src/library/index.mjs'),
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });
  if (path.resolve(output) !== path.join(root, 'dist', 'npm')) throw Error('Invalid output directory');
  await rm(output, {recursive: true, force: true});
  await mkdir(output, {recursive: true});
  await cp(path.join(app, 'src/cli'), path.join(output, 'bin'), {recursive: true});
  // Source uses library/; the public npm layout continues to use core/.
  async function mapCliImports(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await mapCliImports(file);
      else if (entry.name.endsWith('.mjs')) {
        const source = await readFile(file, 'utf8');
        await writeFile(file, source.replaceAll('/library/', '/core/'));
      }
    }
  }
  await mapCliImports(path.join(output, 'bin'));
  await cp(path.join(app, 'src/library'), path.join(output, 'core'), {
    recursive: true,
    filter: src => !src.includes(`${path.sep}test${path.sep}`) && !src.endsWith(`${path.sep}test`),
  });
  await cp(path.join(root, 'scripts/setup/bootstrap.mjs'), path.join(output, 'bin/bootstrap.mjs'));
  await chmod(path.join(output, 'bin/atlas-docs.mjs'), 0o755);
  const standalone = path.join(app, buildDirectory, 'standalone');
  await mkdir(path.join(output, 'runtime'), {recursive: true});
  const server = await readFile(path.join(standalone, 'server.js'), 'utf8');
  await writeFile(
    path.join(output, 'runtime/server.js'),
    `// Graceful stop from the CLI parent so library locks are released on Windows.
if (process.send) {
  process.on('disconnect', () => process.exit(0));
  process.on('message', message => { if (message === 'atlas:shutdown') process.exit(0); });
}
${server}`,
  );
  await cp(path.join(standalone, buildDirectory), path.join(output, 'runtime', buildDirectory), {
    recursive: true,
    filter: source => !source.endsWith('.nft.json') && path.basename(source) !== 'node_modules',
  });
  await cp(path.join(app, buildDirectory, 'static'), path.join(output, 'runtime', buildDirectory, 'static'), {recursive: true});
  await cp(path.join(app, 'public'), path.join(output, 'runtime/public'), {recursive: true});
  await writeFile(path.join(output, 'runtime/package.json'), JSON.stringify({private: true, type: 'commonjs'}));

  const external = [];
  for (const name of Object.keys(manifest.dependencies)) {
    try {
      await access(path.join(standalone, 'node_modules', name, 'package.json'));
      external.push(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const required of ['next', 'react', 'react-dom']) {
    if (!external.includes(required)) throw Error(`Missing runtime dependency in trace: ${required}`);
  }
  const dependencies = Object.fromEntries(
    external.map(name => {
      const version = lock.packages[`node_modules/${name}`]?.version;
      if (!version) throw Error(`Missing locked dependency: ${name}`);
      return [name, version];
    }),
  );
  await writeFile(
    path.join(output, 'package.json'),
    JSON.stringify(
      {
        name: 'atlas-docs',
        version: manifest.version,
        description: 'Local project documentation workspace with Markdown, OpenAPI and SQL viewers',
        license: 'MIT',
        engines: manifest.engines,
        bin: {'atlas-docs': 'bin/atlas-docs.mjs'},
        files: ['bin/', 'core/', 'runtime/', 'agent-kit/', 'README.md', 'LICENSE', 'CHANGELOG.md'],
        dependencies,
        publishConfig: {access: 'public'},
      },
      null,
      2,
    ) + '\n',
  );
  await cp(path.join(root, 'LICENSE'), path.join(output, 'LICENSE'));
  if (await access(path.join(root, 'CHANGELOG.md')).then(() => true, () => false)) {
    await cp(path.join(root, 'CHANGELOG.md'), path.join(output, 'CHANGELOG.md'));
  }

  const kit = path.join(output, 'agent-kit');
  await composeAgentKit(kit, {
    guidesDir: path.join(root, 'guides'),
    examplesDir: path.join(root, 'examples/agent'),
    libraryAgents: path.join(root, 'scripts/templates/library-AGENTS.md'),
    version: manifest.version,
  });

  await writeFile(
    path.join(output, 'README.md'),
    (await readFile(path.join(root, 'guides/npm.md'), 'utf8'))
      .replaceAll('(agent-guide.md)', '(agent-kit/guides/agent-guide.md)')
      .replaceAll('(user-guide.md)', '(agent-kit/guides/user-guide.md)'),
  );

  const files = {};
  async function scan(dir, prefix = '') {
    for (const entry of await readdir(dir, {withFileTypes: true})) {
      const relative = prefix + entry.name;
      if (relative === 'library-AGENTS.md') continue;
      if (entry.isDirectory()) await scan(path.join(dir, entry.name), relative + '/');
      else files[relative] = createHash('sha256').update(await readFile(path.join(dir, entry.name))).digest('hex');
    }
  }
  await scan(kit);
  await writeFile(
    path.join(kit, 'manifest.json'),
    JSON.stringify({format: 'atlas-agent-kit', version: manifest.version, files}, null, 2) + '\n',
  );

  await run(npmArgs(['pack', '--silent', '--pack-destination', path.join(root, 'dist')]), {cwd: output});
  const tarball = path.join(root, 'dist', `atlas-docs-${manifest.version}.tgz`);
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(tarball)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  const digest = hash.digest('hex');
  await writeFile(path.join(root, 'dist', `atlas-docs-${manifest.version}.tgz.sha256`), `${digest}  atlas-docs-${manifest.version}.tgz\n`);
  console.log(`[Atlas Docs] Package ready: dist/atlas-docs-${manifest.version}.tgz`);
  console.log(`[Atlas Docs] SHA-256: ${digest}`);
} finally {
  await rm(temporaryData, {recursive: true, force: true});
}
