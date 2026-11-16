/**
 * Cross-artifact upgrade: published atlas-docs@5.3.0 → current release tarball.
 * Downloads 5.3.0 from the npm registry into a temp dir (records integrity).
 * Asserts data preservation without assuming a schema migration (schema already 1).
 * Does not replace scripts/fixtures/atlas-docs-5.1.0.tgz or test-upgrade-artifacts.mjs.
 */
import {assertPrivatePathFreeTarball} from '../../build/artifact-privacy.mjs';
import assert from 'node:assert/strict';
import {access, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {npmArgs, run} from '../../build/process.mjs';
import {
  assertTarballChecksum,
  createServerTracker,
  json,
  jsonWithSession,
  loadRuntimeSession,
  fetchMediaBytes,
  contentChecksumMap,
  sha256File,
} from '../helpers/package-harness.mjs';

const OLD_VERSION = '5.3.0';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const appVersion = JSON.parse(await readFile(path.join(repo, 'app/package.json'), 'utf8')).version;
const newer = path.resolve(process.env.ATLAS_TEST_TARBALL || path.join(repo, `dist/atlas-docs-${appVersion}.tgz`));
const newerChecksum = `${newer}.sha256`;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
  throw Error(message);
}

function assertProtectedPreserved(expected, actual, label) {
  const expectedFiltered = {};
  const actualSubset = {};
  for (const [key, hash] of Object.entries(expected)) {
    if (key.startsWith('.atlas/guides/')) continue;
    expectedFiltered[key] = hash;
    actualSubset[key] = actual[key];
  }
  const missing = Object.keys(expectedFiltered).filter(k => !actualSubset[k]);
  const changed = Object.keys(expectedFiltered).filter(
    k => actualSubset[k] && expectedFiltered[k] !== actualSubset[k],
  );
  assert.deepEqual({missing, changed}, {missing: [], changed: []}, `${label} protected content mismatch`);
}

try {
  await access(newer);
  await access(newerChecksum);
} catch {
  fail(`New release tarball or checksum missing: ${newer}. Run npm run package:release first.`);
}

const newDigest = await assertTarballChecksum(newer, newerChecksum);
console.log(`New artifact OK (sha256 ${newDigest.slice(0, 12)}…)`);
await assertPrivatePathFreeTarball(newer);

if (appVersion === OLD_VERSION) {
  fail(`app/package.json is still ${OLD_VERSION}; refuse same-version upgrade check`);
}

const temp = await mkdtemp(path.join(tmpdir(), 'atlas-upgrade-530-'));
const env = {...process.env};
delete env.DATA_DIR;
delete env.ATLAS_DOCS_MIGRATE_YES;
delete env.ATLAS_AGENT_KIT;
delete env.ATLAS_CORE_PATH;
delete env.ATLAS_TEST_MIGRATE_ABORT;
delete env.ATLAS_LIBRARY_MODE;
delete env.ATLAS_DOCS_REGISTRY_DIR;

const cwd = path.join(temp, 'upgrade-cwd');
const library = path.join(cwd, 'project-library');
const oldInstall = path.join(temp, 'old');
const newInstall = path.join(temp, 'new');
const packDir = path.join(temp, 'pack');
const registryDir = path.join(temp, 'registry');
const tracker = createServerTracker();
const evidencePath = path.join(temp, 'old-artifact.json');

async function listUpgradeBackups() {
  const parent = path.join(path.dirname(library), '.atlas-docs-upgrade-backups');
  try {
    const names = await readdir(parent);
    return names.map(name => path.join(parent, name)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readDb() {
  return JSON.parse(await readFile(path.join(library, 'db.json'), 'utf8'));
}

try {
  await mkdir(cwd, {recursive: true});
  await mkdir(oldInstall);
  await mkdir(newInstall);
  await mkdir(library);
  await mkdir(packDir);
  await mkdir(registryDir);

  // --- A: download published 5.3.0 (never relabel a newer build) ---
  console.log(`Packing atlas-docs@${OLD_VERSION} from registry…`);
  const pack = spawnSync(
    process.execPath,
    npmArgs(['pack', `atlas-docs@${OLD_VERSION}`, '--pack-destination', packDir, '--json']),
    {encoding: 'utf8', windowsHide: true, cwd: packDir, env, timeout: 180_000},
  );
  if (pack.status !== 0) {
    fail(
      `Could not download atlas-docs@${OLD_VERSION} from npm (exit ${pack.status}). ` +
        `${(pack.stderr || pack.stdout || '').slice(0, 500)}`,
    );
  }
  let packMeta;
  try {
    const parsed = JSON.parse(pack.stdout.trim().split(/\n/).filter(Boolean).at(-1));
    packMeta = Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    packMeta = null;
  }
  const packedName = packMeta?.filename || `atlas-docs-${OLD_VERSION}.tgz`;
  const older = path.join(packDir, packedName);
  await access(older);
  const oldDigest = await sha256File(older);
  const integrity = packMeta?.integrity || `sha256-${Buffer.from(oldDigest, 'hex').toString('base64')}`;
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        version: OLD_VERSION,
        filename: packedName,
        sha256: oldDigest,
        integrity,
        source: `npm pack atlas-docs@${OLD_VERSION}`,
        packedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`Old artifact OK ${packedName} (sha256 ${oldDigest.slice(0, 12)}…) integrity=${integrity}`);

  await run(npmArgs(['install', '--prefix', oldInstall, '--no-audit', '--no-fund', older]), {cwd, env});
  const oldCli = path.join(oldInstall, 'node_modules/atlas-docs/bin/atlas-docs.mjs');
  const oldVer = spawnSync(process.execPath, [oldCli, '--version'], {encoding: 'utf8', windowsHide: true, cwd, env});
  assert.equal(oldVer.status, 0, oldVer.stderr || oldVer.stdout);
  assert.equal(oldVer.stdout.trim(), OLD_VERSION, `Expected old CLI ${OLD_VERSION}, got ${oldVer.stdout.trim()}`);

  const oldServer = await tracker.start(oldCli, {
    cwd,
    env: {...env, ATLAS_DOCS_REGISTRY_DIR: registryDir},
    args: ['--data-dir', library],
  });

  // 5.3.0 single-library APIs do not require runtime session headers.
  const folder = await json(oldServer.url + '/api/folders', 'POST', {title: 'Upgrade530 Topic'});
  const doc = await json(oldServer.url + '/api/docs', 'POST', {folder: folder.path, title: 'Keep From 530', kind: 'md'});
  const upload = new FormData();
  upload.set('file', new File(['upgrade-530-attachment'], 'keep-530.txt', {type: 'text/plain'}));
  const uploaded = await fetch(oldServer.url + '/api/media', {method: 'POST', body: upload});
  assert.equal(uploaded.status, 200, await uploaded.clone().text());
  const media = await uploaded.json();
  const raw1 = `---\ntitle: Keep From 530\n---\n\n# Keep From 530\n\nFirst save.\n`;
  await json(oldServer.url + '/api/docs/' + doc.id, 'PUT', {raw: raw1});
  const raw = `---\ntitle: Keep From 530\n---\n\n# Keep From 530\n\nAttachment: [/api/media/${media.id}](/api/media/${media.id})\n`;
  await json(oldServer.url + '/api/docs/' + doc.id, 'PUT', {raw});
  const comment = await json(oldServer.url + '/api/comments', 'POST', {
    docId: doc.id,
    content: 'preserve comment from 5.3.0',
    quote: 'Keep From 530',
  });
  const settings = await json(oldServer.url + '/api/settings', 'PATCH', {theme: 'dark', leftWidth: 300});
  assert.equal(settings.theme, 'dark');
  const history = await json(oldServer.url + '/api/history?id=' + encodeURIComponent(doc.id));
  assert.ok(history.versions.length >= 2, 'Expected history after two saves');

  await tracker.stop(oldServer);

  const personalAgents = 'Personal 5.3.0 upgrade rules — do not overwrite';
  await writeFile(path.join(library, 'AGENTS.md'), personalAgents);

  const dbBefore = await readDb();
  assert.equal(dbBefore.schemaVersion, 1, '5.3.0 library must already be schema 1');
  const snapshot = {
    docId: doc.id,
    raw,
    mediaId: media.id,
    mediaBytes: 'upgrade-530-attachment',
    commentId: comment.id,
    commentContent: comment.content,
    theme: 'dark',
    leftWidth: 300,
    agents: personalAgents,
    historyCount: history.versions.length,
  };
  const preChecksums = await contentChecksumMap(library);
  const backupsBeforeUpgrade = await listUpgradeBackups();

  // --- B: install candidate and reopen same library ---
  await run(npmArgs(['install', '--prefix', newInstall, '--no-audit', '--no-fund', newer]), {cwd, env});
  const newCli = path.join(newInstall, 'node_modules/atlas-docs/bin/atlas-docs.mjs');
  const newVer = spawnSync(process.execPath, [newCli, '--version'], {encoding: 'utf8', windowsHide: true, cwd, env});
  assert.equal(newVer.status, 0, newVer.stderr || newVer.stdout);
  assert.equal(newVer.stdout.trim(), appVersion, `Expected new CLI ${appVersion}, got ${newVer.stdout.trim()}`);

  const upgraded = await tracker.start(newCli, {
    cwd,
    env: {...env, ATLAS_DOCS_REGISTRY_DIR: registryDir},
    args: ['--data-dir', library],
  });

  const dbAfter = await readDb();
  assert.equal(dbAfter.schemaVersion, 1, 'schemaVersion must remain 1');
  const backupsAfterUpgrade = await listUpgradeBackups();
  assert.equal(
    backupsAfterUpgrade.length,
    backupsBeforeUpgrade.length,
    '5.3.0 → current must not create a schema upgrade backup',
  );

  const session = await loadRuntimeSession(upgraded.url);
  assert.equal((await jsonWithSession(upgraded.url + '/api/docs/' + doc.id, session)).raw, snapshot.raw);
  assert.equal(await fetchMediaBytes(upgraded.url, media.id, session), snapshot.mediaBytes);
  const comments = await jsonWithSession(
    upgraded.url + '/api/comments?docId=' + encodeURIComponent(doc.id),
    session,
  );
  assert.ok(comments.some(c => c.id === snapshot.commentId && c.content === snapshot.commentContent));
  const settingsAfter = await jsonWithSession(upgraded.url + '/api/settings', session);
  assert.equal(settingsAfter.theme, snapshot.theme);
  assert.equal(settingsAfter.leftWidth, snapshot.leftWidth);
  assert.equal(await readFile(path.join(library, 'AGENTS.md'), 'utf8'), snapshot.agents);
  const historyAfter = await jsonWithSession(
    upgraded.url + '/api/history?id=' + encodeURIComponent(doc.id),
    session,
  );
  assert.ok(historyAfter.versions.length >= snapshot.historyCount);
  assertProtectedPreserved(preChecksums, await contentChecksumMap(library), '5.3.0→current upgrade');

  const continued = `---\ntitle: Keep From 530\n---\n\n# Keep From 530\n\nContinued after upgrade to ${appVersion}.\n`;
  await jsonWithSession(upgraded.url + '/api/docs/' + doc.id, session, 'PUT', {raw: continued});
  assert.equal((await jsonWithSession(upgraded.url + '/api/docs/' + doc.id, session)).raw, continued);

  await tracker.stop(upgraded);

  // --- C: restart — still no extra migration backup ---
  const backupsBeforeRerun = await listUpgradeBackups();
  const rerun = await tracker.start(newCli, {
    cwd,
    env: {...env, ATLAS_DOCS_REGISTRY_DIR: registryDir},
    args: ['--data-dir', library],
  });
  const rerunSession = await loadRuntimeSession(rerun.url);
  assert.equal((await jsonWithSession(rerun.url + '/api/docs/' + doc.id, rerunSession)).raw, continued);
  assert.equal((await readDb()).schemaVersion, 1);
  assert.equal(
    (await listUpgradeBackups()).length,
    backupsBeforeRerun.length,
    'Restart must not create an upgrade backup',
  );
  await tracker.stop(rerun);

  console.log(`PASS: upgrade ${OLD_VERSION} → ${appVersion} (no schema migration; data preserved)`);
  console.log(`Evidence: ${evidencePath}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await tracker.cleanup();
  if (process.env.ATLAS_KEEP_UPGRADE_TMP !== '1') {
    await rm(temp, {recursive: true, force: true});
  } else {
    console.log(`Kept temp: ${temp}`);
  }
}
