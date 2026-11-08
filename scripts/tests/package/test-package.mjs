import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm, access} from 'node:fs/promises';
import {spawn, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {npmArgs, run} from '../../build/process.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const version = JSON.parse(await readFile(path.join(repo, 'app/package.json'), 'utf8')).version;
const tarball = path.resolve(process.env.ATLAS_TEST_TARBALL || path.join(repo, `dist/atlas-docs-${version}.tgz`));
await access(tarball);
const temp = await mkdtemp(path.join(tmpdir(), 'atlas-package-'));
const children = new Set();
const env = {...process.env}; delete env.DATA_DIR;
const installed = path.join(temp, 'install');
const cwd = path.join(temp, 'dự án có dấu');
async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve)); return value;
}
function capture(args, options = {}) {
  const result = spawnSync(process.execPath, args, {cwd, env, encoding: 'utf8', windowsHide: true, ...options});
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}
async function start(cli, args = [], extraEnv = {}, viaNpx = false) {
  const p = await port();
  const command = viaNpx ? npmArgs(['exec', '--offline', '--prefix', installed, '--', 'atlas-docs']) : [cli];
  const child = spawn(process.execPath, [...command, '--no-open', '--port', String(p), ...args], {cwd, env: {...env, ...extraEnv}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true, detached: viaNpx && process.platform !== 'win32'});
  child.atlasViaNpx = viaNpx;
  children.add(child);
  let logs = '';
  child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
  child.on('error', error => { logs += error.message; });
  for (let i = 0; i < 450; i++) {
    if (child.exitCode !== null) throw Error(logs);
    if (logs.includes('[Atlas Docs] Ready:')) return {child, url: `http://127.0.0.1:${p}`, p, viaNpx};
    // Windows CI may buffer CLI stdout; health proves the server is usable.
    try {
      const response = await fetch(`http://127.0.0.1:${p}/api/health`, {signal: AbortSignal.timeout(2000)});
      if (response.ok) return {child, url: `http://127.0.0.1:${p}`, p, viaNpx};
    } catch {}
    await delay(200);
  }
  throw Error(`Startup timeout: ${logs}`);
}
async function stop(server) {
  const child = server.child;
  if (child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    if (server.viaNpx) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true});
      else process.kill(-child.pid, 'SIGINT');
    } else if (process.platform === 'win32') child.send('atlas:stop'); else child.kill('SIGINT');
    let timer;
    try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Shutdown timeout')), 15000); })]); }
    finally { clearTimeout(timer); }
  }
  children.delete(child);
  await assert.rejects(() => fetch(server.url + '/api/health', {signal: AbortSignal.timeout(1000)}));
}
async function json(url, method = 'GET', body) {
  const response = await fetch(url, {method, headers: {'Content-Type': 'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  assert.equal(response.status, 200, await response.clone().text()); return response.json();
}
async function files(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules') continue;
    const rel = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(path.join(dir, entry.name), rel + '/'));
    else result.push(rel);
  }
  return result;
}
try {
  await mkdir(cwd); await mkdir(installed);
  await run(npmArgs(['install', '--prefix', installed, '--no-audit', '--no-fund', tarball]), {cwd, env});
  const pkg = path.join(installed, 'node_modules/atlas-docs');
  const cli = path.join(pkg, 'bin/atlas-docs.mjs');
  assert.match(capture(npmArgs(['exec', '--offline', '--prefix', installed, '--', 'atlas-docs', '--version'])), new RegExp(version.replaceAll('.', '\\.')));
  assert.match(capture([cli, '--help']), /--data-dir/);
  assert.deepEqual(await readdir(cwd), [], 'help and version must not create data');
  const packedFiles = await files(pkg);
  assert.ok(packedFiles.includes('runtime/.next-npm-release/BUILD_ID'));
  assert.ok(!packedFiles.some(file => /(^|\/)(data|tests|test-results|cache|\.git)(\/|$)|\.env|\.node$/.test(file)), 'No local data, tests, caches, secrets or native binaries');
  assert.ok(!await readdir(path.join(pkg, 'runtime')).then(names => names.includes('node_modules')));
  const kitManifest = JSON.parse(await readFile(path.join(pkg, 'agent-kit/manifest.json'), 'utf8'));
  for (const name of Object.keys(kitManifest.files).filter(name => name.endsWith('.md'))) {
    const content = await readFile(path.join(pkg, 'agent-kit', name), 'utf8');
    // Ignore fenced examples; their links are templates for future user documents.
    const prose = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    for (const match of prose.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^(https?:|\/)/.test(target)) continue;
      // The template is installed at the library root, not within the kit.
      const resolved = name === 'library-AGENTS.md' ? path.join(pkg, 'agent-kit', target.replace(/^\.atlas\//, '')) : path.resolve(pkg, 'agent-kit', path.dirname(name), target);
      await access(resolved);
    }
  }
  const server = await start(cli);
  const library = path.join(cwd, 'atlas-docs-data');
  assert.equal((await json(server.url + '/api/docs')).length, 0);
  for (const route of ['/', '/help', '/help/agent-guide', '/help/npm']) {
    const response = await fetch(server.url + route); assert.equal(response.status, 200);
    assert.match(await response.text(), /Atlas|guide/i);
  }
  const html = await (await fetch(server.url)).text();
  const asset = html.match(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/);
  assert.ok(asset, 'Rendered page references static assets');
  assert.equal((await fetch(server.url + asset[1])).status, 200);
  const folder = await json(server.url + '/api/folders', 'POST', {title: 'Package test'});
  const doc = await json(server.url + '/api/docs', 'POST', {folder: folder.path, title: 'Hello', kind: 'md'});
  const upload = new FormData(); upload.set('file', new File(['attachment content'], 'tài liệu.txt', {type: 'text/plain'}));
  const uploaded = await fetch(server.url + '/api/media', {method: 'POST', body: upload}); assert.equal(uploaded.status, 200);
  const media = await uploaded.json();
  const raw = `# Packaged app\n\n[Attachment](/api/media/${media.id})\n`;
  await json(server.url + '/api/docs/' + doc.id, 'PUT', {raw});
  assert.equal((await json(server.url + '/api/docs/' + doc.id)).raw, raw);
  assert.ok((await json(server.url + '/api/history?id=' + encodeURIComponent(doc.id))).versions.length > 0);
  const busy = spawnSync(process.execPath, [cli, '--port', String(server.p), '--no-open', '--data-dir', 'must-not-exist'], {cwd, env, encoding: 'utf8', windowsHide: true});
  assert.equal(busy.status, 1); assert.match(busy.stderr, /another --port/);
  await assert.rejects(() => access(path.join(cwd, 'must-not-exist')));
  const zipResponse = await fetch(server.url + '/api/backup'); assert.equal(zipResponse.status, 200);
  const zip = Buffer.from(await zipResponse.arrayBuffer());
  await writeFile(path.join(library, 'AGENTS.md'), 'Keep my rules');
  await writeFile(path.join(library, '.atlas/guides/agent-guide.md'), 'Keep my guide edits');
  await stop(server);
  const restarted = await start(cli);
  assert.equal((await json(restarted.url + '/api/docs/' + doc.id)).raw, raw);
  assert.equal(await readFile(path.join(library, 'AGENTS.md'), 'utf8'), 'Keep my rules');
  const backups = await readdir(path.join(library, '.atlas/backups'));
  assert.equal(await readFile(path.join(library, '.atlas/backups', backups[0], 'guides/agent-guide.md'), 'utf8'), 'Keep my guide edits');
  await stop(restarted);

  const globalPrefix = path.join(temp, 'global');
  await run(npmArgs(['install', '--global', '--prefix', globalPrefix, '--no-audit', '--no-fund', tarball]), {cwd, env});
  const globalPackage = path.join(globalPrefix, process.platform === 'win32' ? 'node_modules/atlas-docs' : 'lib/node_modules/atlas-docs');
  const shim = path.join(globalPrefix, process.platform === 'win32' ? 'atlas-docs.cmd' : 'bin/atlas-docs');
  const shimResult = process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '& $env:ATLAS_TEST_SHIM --version; exit $LASTEXITCODE'], {cwd, env: {...env, ATLAS_TEST_SHIM: shim}, encoding: 'utf8', windowsHide: true})
    : spawnSync(shim, ['--version'], {cwd, env, encoding: 'utf8'});
  assert.equal(shimResult.status, 0, shimResult.stderr); assert.equal(shimResult.stdout.trim(), version);
  const restored = await start(path.join(globalPackage, 'bin/atlas-docs.mjs'), ['--data-dir', 'restored library'], {DATA_DIR: 'wrong library'});
  assert.equal((await json(restored.url + '/api/docs')).length, 0);
  const imported = await fetch(restored.url + '/api/backup', {method: 'POST', headers: {'Content-Type': 'application/zip'}, body: zip});
  assert.equal(imported.status, 200, await imported.clone().text());
  assert.equal((await json(restored.url + '/api/docs/' + doc.id)).raw, raw);
  assert.equal(await (await fetch(restored.url + '/api/media/' + media.id)).text(), 'attachment content');
  assert.notEqual(await readFile(path.join(cwd, 'restored library/AGENTS.md'), 'utf8'), 'Keep my rules');
  await assert.rejects(() => access(path.join(cwd, 'wrong library')));
  await stop(restored);
  const envServer = await start(cli, [], {DATA_DIR: 'from environment'});
  await access(path.join(cwd, 'from environment/db.json')); await stop(envServer);
  const npxServer = await start(cli, ['--data-dir', 'npx library'], {}, true);
  assert.equal((await json(npxServer.url + '/api/docs')).length, 0);
  await stop(npxServer);
  console.log('PASS: actual tarball local/npx/global install, guides and links, Help/static assets, document save, upload, backup/import, data precedence, restart preservation, busy port and shutdown');
} finally {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true});
    else if (child.atlasViaNpx) process.kill(-child.pid, 'SIGTERM');
    else child.kill();
  }
  if (children.size) await delay(1500);
  await rm(temp, {recursive: true, force: true, maxRetries: 6, retryDelay: 500});
}
