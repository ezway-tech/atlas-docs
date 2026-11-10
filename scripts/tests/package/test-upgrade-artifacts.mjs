import {assertPrivatePathFreeTarball} from '../../build/artifact-privacy.mjs';
/**
 * Real cross-artifact upgrade: atlas-docs 5.1.0 → current release tarball.
 * Missing old/new artifact or checksum mismatch fails the run (no SKIP success).
 * Also kills migrate at each ATLAS_TEST_MIGRATE_ABORT point and recovers via normal CLI --yes.
 */
import assert from 'node:assert/strict';
import {access, cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {npmArgs, run} from '../../build/process.mjs';
import {
  assertTarballChecksum,
  createServerTracker,
  json,
  contentChecksumMap,
  assertChecksumMapsEqual,
} from '../helpers/package-harness.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const appVersion = JSON.parse(await readFile(path.join(repo, 'app/package.json'), 'utf8')).version;
const newer = path.resolve(process.env.ATLAS_TEST_TARBALL || path.join(repo, `dist/atlas-docs-${appVersion}.tgz`));
const older = path.resolve(process.env.ATLAS_TEST_OLD_TARBALL || path.join(repo, 'scripts/fixtures/atlas-docs-5.1.0.tgz'));
const olderChecksum = path.resolve(
  process.env.ATLAS_TEST_OLD_TARBALL_SHA256 || path.join(repo, 'scripts/fixtures/atlas-docs-5.1.0.tgz.sha256'),
);
const abortRunner = path.join(repo, 'scripts/tests/helpers/migrate-abort-runner.mjs');
const ABORT_POINTS = ['after-backup', 'after-journal', 'after-data', 'before-complete'];
const MIGRATE_ABORT_EXIT = 97;
const JOURNAL = '.atlas-migrate-journal.json';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
  throw Error(message);
}

/** Assert expected protected paths survived; allow extra keys (e.g. new guide backups). */
function assertProtectedPreserved(expected, actual, label) {
  const expectedFiltered = {};
  const actualSubset = {};
  for (const [key, hash] of Object.entries(expected)) {
    if (key.startsWith('.atlas/guides/')) continue;
    expectedFiltered[key] = hash;
    actualSubset[key] = actual[key];
  }
  assertChecksumMapsEqual(expectedFiltered, actualSubset, label);
}

try {
  await access(newer);
} catch {
  fail(`New release tarball missing: ${newer}. Run npm run package:release first.`);
}
try {
  await access(older);
} catch {
  fail(`Old release tarball missing: ${older}. Place atlas-docs-5.1.0.tgz under scripts/fixtures/.`);
}
try {
  await access(olderChecksum);
} catch {
  fail(`Old tarball checksum missing: ${olderChecksum}`);
}

const oldDigest = await assertTarballChecksum(older, olderChecksum);
console.log(`Old artifact OK (sha256 ${oldDigest.slice(0, 12)}…)`);
await assertPrivatePathFreeTarball(newer);
console.log(`New artifact: ${newer}`);

const temp = await mkdtemp(path.join(tmpdir(), 'atlas-upgrade-'));
const env = {...process.env};
delete env.DATA_DIR;
delete env.ATLAS_DOCS_MIGRATE_YES;
delete env.ATLAS_AGENT_KIT;
delete env.ATLAS_CORE_PATH;
delete env.ATLAS_TEST_MIGRATE_ABORT;

const cwd = path.join(temp, 'dự án có dấu');
const library = path.join(cwd, 'project-library');
const oldInstall = path.join(temp, 'old');
const newInstall = path.join(temp, 'new');
const coldCopy = path.join(temp, 'cold-pre-upgrade');
const tracker = createServerTracker();

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

async function journalExists() {
  try {
    await access(path.join(library, JOURNAL));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function spawnMigrateAbort(abortPoint, corePath) {
  return spawnSync(
    process.execPath,
    [abortRunner, library, corePath, abortPoint, appVersion],
    {encoding: 'utf8', windowsHide: true, cwd, env: {...env}, timeout: 120_000},
  );
}

try {
  await mkdir(cwd, {recursive: true});
  await mkdir(oldInstall);
  await mkdir(newInstall);
  await mkdir(library);

  // --- A: install and seed with 5.1.0 ---
  await run(npmArgs(['install', '--prefix', oldInstall, '--no-audit', '--no-fund', older]), {cwd, env});
  const oldCli = path.join(oldInstall, 'node_modules/atlas-docs/bin/atlas-docs.mjs');
  const oldVer = spawnSync(process.execPath, [oldCli, '--version'], {encoding: 'utf8', windowsHide: true, cwd, env});
  assert.equal(oldVer.status, 0, oldVer.stderr || oldVer.stdout);
  assert.equal(oldVer.stdout.trim(), '5.1.0', `Expected old CLI 5.1.0, got ${oldVer.stdout.trim()}`);

  const oldServer = await tracker.start(oldCli, {
    cwd,
    env,
    args: ['--data-dir', library],
  });

  const folder = await json(oldServer.url + '/api/folders', 'POST', {title: 'Upgrade Topic'});
  const doc = await json(oldServer.url + '/api/docs', 'POST', {folder: folder.path, title: 'Keep Me', kind: 'md'});
  const upload = new FormData();
  upload.set('file', new File(['upgrade-attachment-bytes'], 'keep-me.txt', {type: 'text/plain'}));
  const uploaded = await fetch(oldServer.url + '/api/media', {method: 'POST', body: upload});
  assert.equal(uploaded.status, 200, await uploaded.clone().text());
  const media = await uploaded.json();
  const raw = `---\ntitle: Keep Me\n---\n\n# Keep Me\n\nAttachment: [/api/media/${media.id}](/api/media/${media.id})\n`;
  await json(oldServer.url + '/api/docs/' + doc.id, 'PUT', {raw});
  const comment = await json(oldServer.url + '/api/comments', 'POST', {
    docId: doc.id,
    content: 'preserve this comment',
    quote: 'Keep Me',
  });
  const settings = await json(oldServer.url + '/api/settings', 'PATCH', {theme: 'light', leftWidth: 280});
  assert.equal(settings.theme, 'light');
  const history = await json(oldServer.url + '/api/history?id=' + encodeURIComponent(doc.id));
  assert.ok(history.versions.length > 0, 'Expected history after save');

  await tracker.stop(oldServer);

  const personalAgents = 'Personal upgrade rules — do not overwrite';
  const personalGuide = 'Edited agent guide body for upgrade test';
  await writeFile(path.join(library, 'AGENTS.md'), personalAgents);
  const guidePath = path.join(library, '.atlas/guides/agent-guide.md');
  await access(guidePath);
  await writeFile(guidePath, personalGuide);

  const dbBefore = await readDb();
  assert.equal(dbBefore.schemaVersion, undefined, '5.1.0 library must not carry schemaVersion');
  const snapshot = {
    docId: doc.id,
    raw,
    mediaId: media.id,
    mediaBytes: 'upgrade-attachment-bytes',
    commentId: comment.id,
    commentContent: comment.content,
    theme: 'light',
    leftWidth: 280,
    agents: personalAgents,
    guide: personalGuide,
    historyCount: history.versions.length,
  };
  const preChecksums = await contentChecksumMap(library);

  await cp(library, coldCopy, {recursive: true});

  // --- B: upgrade with current package ---
  await run(npmArgs(['install', '--prefix', newInstall, '--no-audit', '--no-fund', newer]), {cwd, env});
  const newCli = path.join(newInstall, 'node_modules/atlas-docs/bin/atlas-docs.mjs');
  const corePath = path.join(newInstall, 'node_modules/atlas-docs/core/index.mjs');
  const newVer = spawnSync(process.execPath, [newCli, '--version'], {encoding: 'utf8', windowsHide: true, cwd, env});
  assert.equal(newVer.status, 0, newVer.stderr || newVer.stdout);
  assert.equal(newVer.stdout.trim(), appVersion, `Expected new CLI ${appVersion}, got ${newVer.stdout.trim()}`);
  assert.notEqual(newVer.stdout.trim(), '5.1.0');

  const core = await import(pathToFileURL(corePath).href);
  assert.equal(core.MIGRATE_ABORT_EXIT, MIGRATE_ABORT_EXIT);
  assert.ok(core.MIGRATE_ABORT_POINTS.has('after-backup'));

  const backupsBeforeUpgrade = await listUpgradeBackups();
  const upgraded = await tracker.start(newCli, {
    cwd,
    env,
    args: ['--data-dir', library, '--yes'],
  });
  assert.match(upgraded.logs, /[Mm]igrat|schema|backup|Ready/, upgraded.logs);

  const dbAfter = await readDb();
  assert.equal(dbAfter.schemaVersion, 1, 'Expected schemaVersion 1 after upgrade');
  assert.equal((await json(upgraded.url + '/api/docs/' + doc.id)).raw, snapshot.raw);
  assert.equal(await (await fetch(upgraded.url + '/api/media/' + media.id)).text(), snapshot.mediaBytes);
  const comments = await json(upgraded.url + '/api/comments?docId=' + encodeURIComponent(doc.id));
  assert.ok(comments.some(c => c.id === snapshot.commentId && c.content === snapshot.commentContent));
  const settingsAfter = await json(upgraded.url + '/api/settings');
  assert.equal(settingsAfter.theme, snapshot.theme);
  assert.equal(settingsAfter.leftWidth, snapshot.leftWidth);
  assert.equal(await readFile(path.join(library, 'AGENTS.md'), 'utf8'), snapshot.agents);
  {
    const currentGuide = await readFile(guidePath, 'utf8');
    if (currentGuide !== snapshot.guide) {
      const backupRoot = path.join(library, '.atlas/backups');
      const backupDirs = await readdir(backupRoot);
      assert.ok(backupDirs.length > 0, 'Edited managed guide must be backed up on kit sync');
      let found = false;
      for (const id of backupDirs) {
        try {
          const saved = await readFile(path.join(backupRoot, id, 'guides/agent-guide.md'), 'utf8');
          if (saved === snapshot.guide) found = true;
        } catch {}
      }
      assert.ok(found, 'Preserved edited agent-guide.md under .atlas/backups');
    }
  }
  const historyAfter = await json(upgraded.url + '/api/history?id=' + encodeURIComponent(doc.id));
  assert.ok(historyAfter.versions.length >= snapshot.historyCount);
  assertProtectedPreserved(preChecksums, await contentChecksumMap(library), 'happy-path upgrade');

  const backupsAfterUpgrade = await listUpgradeBackups();
  assert.ok(backupsAfterUpgrade.length > backupsBeforeUpgrade.length, 'Expected an upgrade backup outside the library');
  const newestBackup = backupsAfterUpgrade[backupsAfterUpgrade.length - 1];
  await access(path.join(newestBackup, 'atlas-upgrade-manifest.json'));
  await core.verifyFullBackup(newestBackup);

  await tracker.stop(upgraded);

  // --- C: re-run new app — no second migration ---
  const backupsBeforeRerun = await listUpgradeBackups();
  const rerun = await tracker.start(newCli, {
    cwd,
    env,
    args: ['--data-dir', library],
  });
  assert.doesNotMatch(rerun.logs, /migrate schema|Migration complete/i, rerun.logs);
  assert.equal((await readDb()).schemaVersion, 1);
  assert.equal((await json(rerun.url + '/api/docs/' + doc.id)).raw, snapshot.raw);
  assert.equal(await readFile(path.join(library, 'AGENTS.md'), 'utf8'), snapshot.agents);
  const backupsAfterRerun = await listUpgradeBackups();
  assert.equal(backupsAfterRerun.length, backupsBeforeRerun.length, 'Re-run must not create another upgrade backup');
  await tracker.stop(rerun);

  // --- D: interrupted migration recovery (API + CLI with simulated journal) ---
  await rm(library, {recursive: true, force: true});
  await cp(coldCopy, library, {recursive: true});
  const journal = {
    status: 'running',
    from: null,
    to: 1,
    steps: ['legacy-to-1'],
    backupDir: newestBackup,
    startedAt: new Date().toISOString(),
    completedSteps: [],
  };
  await writeFile(path.join(library, JOURNAL), `${JSON.stringify(journal, null, 2)}\n`);
  assert.equal((await readDb()).schemaVersion, undefined);

  const recovered = await core.recoverInterruptedMigration(library);
  assert.equal(recovered.recovered, true);
  try {
    await access(path.join(library, JOURNAL));
    fail('Migrate journal should be cleared after recovery');
  } catch (error) {
    assert.equal(error.code, 'ENOENT');
  }
  const dbRecovered = await readDb();
  assert.equal(dbRecovered.schemaVersion, undefined);
  const docParts = doc.id.split('/');
  const docFile = path.join(library, 'docs', ...docParts.slice(0, -1), `${docParts.at(-1)}.md`);
  assert.equal(await readFile(docFile, 'utf8'), snapshot.raw);
  assert.equal(await readFile(path.join(library, 'AGENTS.md'), 'utf8'), snapshot.agents);
  assertProtectedPreserved(preChecksums, await contentChecksumMap(library), 'api recover');

  const afterRecover = await tracker.start(newCli, {
    cwd,
    env,
    args: ['--data-dir', library, '--yes'],
  });
  assert.equal((await readDb()).schemaVersion, 1);
  assert.equal((await json(afterRecover.url + '/api/docs/' + doc.id)).raw, snapshot.raw);
  assert.equal(await (await fetch(afterRecover.url + '/api/media/' + media.id)).text(), snapshot.mediaBytes);
  await tracker.stop(afterRecover);

  await rm(library, {recursive: true, force: true});
  await cp(coldCopy, library, {recursive: true});
  await writeFile(path.join(library, JOURNAL), `${JSON.stringify({...journal, backupDir: newestBackup}, null, 2)}\n`);
  const cliRecover = await tracker.start(newCli, {
    cwd,
    env,
    args: ['--data-dir', library, '--yes'],
  });
  assert.match(cliRecover.logs, /Recovering interrupted|Ready/, cliRecover.logs);
  assert.equal((await readDb()).schemaVersion, 1);
  assert.equal((await json(cliRecover.url + '/api/docs/' + doc.id)).raw, snapshot.raw);
  await tracker.stop(cliRecover);

  // --- E: real process kill at each abort point, then normal CLI --yes ---
  for (const abortPoint of ABORT_POINTS) {
    console.log(`Abort point: ${abortPoint}`);
    await rm(library, {recursive: true, force: true});
    await cp(coldCopy, library, {recursive: true});
    assert.equal((await readDb()).schemaVersion, undefined);
    const backupsBeforeAbort = await listUpgradeBackups();

    const killed = spawnMigrateAbort(abortPoint, corePath);
    assert.equal(
      killed.status,
      MIGRATE_ABORT_EXIT,
      `${abortPoint}: expected exit ${MIGRATE_ABORT_EXIT}, got ${killed.status}\n${killed.stdout}\n${killed.stderr}`,
    );

    const hasJournal = await journalExists();
    if (abortPoint === 'after-backup') {
      assert.equal(hasJournal, false, 'after-backup must not leave a migrate journal');
    } else {
      assert.equal(hasJournal, true, `${abortPoint} must leave a migrate journal`);
      const j = JSON.parse(await readFile(path.join(library, JOURNAL), 'utf8'));
      assert.equal(j.status, 'running');
      assert.ok(j.backupDir, `${abortPoint} journal needs backupDir`);
      await core.verifyFullBackup(j.backupDir);
    }
    const backupsAfterAbort = await listUpgradeBackups();
    assert.ok(backupsAfterAbort.length > backupsBeforeAbort.length, `${abortPoint}: expected upgrade backup`);

    if (abortPoint === 'after-data' || abortPoint === 'before-complete') {
      assert.equal((await readDb()).schemaVersion, 1, `${abortPoint}: data steps already applied`);
    } else {
      assert.equal((await readDb()).schemaVersion, undefined, `${abortPoint}: data must still be legacy`);
    }

    const resumed = await tracker.start(newCli, {
      cwd,
      env,
      args: ['--data-dir', library, '--yes'],
    });
    assert.equal((await readDb()).schemaVersion, 1, `${abortPoint}: schemaVersion 1 after CLI resume`);
    assert.equal((await json(resumed.url + '/api/docs/' + doc.id)).raw, snapshot.raw);
    assert.equal(await (await fetch(resumed.url + '/api/media/' + media.id)).text(), snapshot.mediaBytes);
    assert.equal(await readFile(path.join(library, 'AGENTS.md'), 'utf8'), snapshot.agents);
    assertProtectedPreserved(preChecksums, await contentChecksumMap(library), `resume after ${abortPoint}`);
    await tracker.stop(resumed);

    const backupsBeforeSecond = await listUpgradeBackups();
    const second = await tracker.start(newCli, {
      cwd,
      env,
      args: ['--data-dir', library],
    });
    assert.doesNotMatch(second.logs, /migrate schema|Migration complete/i, second.logs);
    assert.equal((await readDb()).schemaVersion, 1);
    assert.equal(await listUpgradeBackups().then(list => list.length), backupsBeforeSecond.length);
    await tracker.stop(second);
  }

  console.log(
    'PASS: upgrade 5.1.0 → ' +
      appVersion +
      ' (seed, migrate+backup, re-run, interrupt/recover, abort-kill×4)',
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await tracker.cleanup();
  await rm(temp, {recursive: true, force: true, maxRetries: 8, retryDelay: 500});
}
