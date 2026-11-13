import {browserOptions} from '../helpers/browser.mjs';
import {appRequire, appRoot, repoRoot} from '../../dependencies.mjs';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {initEmptyLibrary, acquireLibraryLock} from '../../../app/src/library/index.mjs';
const {chromium} = appRequire('@playwright/test');
const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-picker-ui-'));
const port = Number(process.env.TEST_PORT || 3257), origin = `http://127.0.0.1:${port}`;
const output = path.join(appRoot, 'test-results/source-picker');
const env = {...process.env, DATA_DIR: '', ATLAS_LIBRARY_MODE: 'manager',
  ATLAS_DIST_DIR: process.env.ATLAS_DIST_DIR || 'test-results/builds/source-picker',
  ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'registry'), ATLAS_DOCS_LIBRARIES_DIR: path.join(root, 'libraries'),
  ATLAS_DOCS_ALLOWED_ROOTS: root, ATLAS_DOCS_NO_UPDATE_CHECK: '1'};
let child, browser, logs = '';
function launch(extra = {}) {
  child = spawn(process.execPath, [path.join(repoRoot, 'scripts/setup/source-start.mjs'), process.env.ATLAS_SOURCE_TEST_DEV ? 'dev' : 'start', '--port', String(port)], {
    cwd: appRoot, env: {...env, ...extra}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true});
  child.stdout.on('data', b => {logs = (logs + b).slice(-16000);});
  child.stderr.on('data', b => {logs = (logs + b).slice(-16000);});
}
async function ready() {
  for (let i = 0; i < 180; i++) {
    if (child.exitCode !== null) throw Error(logs);
    try {if ((await fetch(origin + '/api/libraries/ready')).ok) return;} catch {}
    await delay(250);
  }
  throw Error('Not ready: ' + logs);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const ended = new Promise(resolve => child.once('exit', resolve));
  child.send('atlas:stop');
  await ended;
}
async function api(route, body, session) {
  session ||= await (await fetch(origin + '/api/libraries/session')).json();
  return fetch(origin + route, {method: body ? 'POST' : 'GET', headers: {
    'Content-Type': 'application/json', 'X-Atlas-Library-Api': '1',
    'X-Atlas-Runtime': session.runtimeId, 'X-Atlas-Library': session.libraryId,
  }, ...(body ? {body: JSON.stringify(body)} : {})});
}
try {
  await mkdir(path.join(root, 'libraries'), {recursive: true});
  await mkdir(path.join(root, 'original', 'guide'), {recursive: true});
  await writeFile(path.join(root, 'original', 'guide', 'hello.md'), '# Hello\nOriginal bytes');
  await writeFile(path.join(root, 'original', 'photo.png'), 'keep');
  await mkdir(output, {recursive: true});
  launch(); await ready();
  browser = await chromium.launch(browserOptions);
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  await page.context().addCookies([{name: 'atlas-locale', value: 'en', url: origin}]);
  page.setDefaultTimeout(process.env.ATLAS_SOURCE_TEST_DEV ? 120000 : 30000);
  page.setDefaultNavigationTimeout(process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 30000);
  await page.goto(origin);
  const chooser = page.getByRole('dialog', {name: 'Choose a document source', exact: true});
  await chooser.getByRole('button', {name: 'Use demo docs', exact: false}).waitFor();
  await page.screenshot({path: path.join(output, 'desktop.png')});
  const bounds = await chooser.boundingBox();
  assert.ok(Math.abs(bounds.x + bounds.width / 2 - 720) < 3);
  assert.ok(Math.abs(bounds.y + bounds.height / 2 - 450) < 3);
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: path.join(output, 'mobile.png')});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({width: 1440, height: 900});
  await chooser.getByRole('button', {name: 'Use demo docs', exact: false}).click();
  await chooser.waitFor({state: 'hidden', timeout: process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 60000});
  await page.waitForSelector('.source-switcher', {timeout: process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 60000});
  assert.equal(await chooser.count(), 0, 'successful switch skips the opening chooser');
  const demoSession = await (await fetch(origin + '/api/libraries/session')).json();
  if (process.env.ATLAS_SOURCE_TEST_DEV) {
    assert.equal(demoSession.mode, 'library');
    console.log('PASS: development launcher, centered chooser and demo switch');
  } else {
  await writeFile(path.join(demoSession.libraryRoot, 'docs', 'keep.txt'), 'demo edit');
  await page.reload(); await chooser.waitFor();
  await chooser.getByRole('button', {name: 'Use demo docs', exact: false}).click();
  await chooser.waitFor({state: 'hidden', timeout: process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 60000});
  await page.waitForSelector('.source-switcher', {timeout: process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 60000});
  const demoAgain = await (await fetch(origin + '/api/libraries/session')).json();
  assert.equal(demoAgain.libraryRoot, demoSession.libraryRoot);
  assert.equal(await readFile(path.join(demoAgain.libraryRoot, 'docs', 'keep.txt'), 'utf8'), 'demo edit');
  assert.equal((await api('/api/settings', null, demoSession)).status, 409, 'old sessions are refused');
  const lockedRoot = path.join(root, 'locked');
  await initEmptyLibrary(lockedRoot);
  const lock = await acquireLibraryLock(lockedRoot);
  try {assert.equal((await api('/api/libraries/open', {path: lockedRoot})).status, 409);}
  finally {await lock.release();}
  assert.equal((await api('/api/libraries/open', {path: path.join(root, 'missing')})).status, 409);
  await page.locator('.source-switcher').click();
  await chooser.getByRole('button', {name: 'My documents', exact: false}).click();
  await chooser.getByRole('textbox', {name: 'Folder path', exact: true}).fill(path.join(root, 'original'));
  await chooser.getByRole('button', {name: 'Open library', exact: true}).click();
  await chooser.getByRole('button', {name: 'Preview import', exact: true}).click();
  await chooser.getByText('guide/hello.md', {exact: true}).waitFor();
  await chooser.getByText(/photo.png —/).waitFor();
  await page.screenshot({path: path.join(output, 'import.png')});
  await chooser.getByRole('button', {name: 'Import and open', exact: true}).click();
  await chooser.waitFor({state: 'hidden', timeout: process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 60000});
  await page.waitForSelector('.source-switcher', {timeout: process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 60000});
  const copied = await (await fetch(origin + '/api/libraries/session')).json();
  assert.equal(await readFile(path.join(copied.libraryRoot, 'docs', 'guide', 'hello.md'), 'utf8'), '# Hello\nOriginal bytes');
  assert.deepEqual((await readdir(path.join(root, 'original'))).sort(), ['guide', 'photo.png']);
  assert.equal(await readFile(path.join(root, 'original', 'guide', 'hello.md'), 'utf8'), '# Hello\nOriginal bytes');
  // Unsaved document text must not be lost when the user cancels source switching.
  await page.goto(origin + '/docs/guide/hello');
  await chooser.getByRole('button', {name: 'Continue reading', exact: true}).click();
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  await page.getByRole('radio', {name: 'Visual', exact: true}).click();
  await page.locator('.tiptap[contenteditable=true]').fill('Unsaved document');
  await page.locator('.source-switcher').click();
  const discard = page.getByRole('dialog', {name: 'Discard changes', exact: true});
  await discard.getByRole('button', {name: 'Cancel', exact: true}).click();
  assert.equal(await chooser.count(), 0);
  assert.ok((await page.locator('.tiptap[contenteditable=true]').innerText()).includes('Unsaved document'));
  await page.locator('.source-switcher').click();
  await discard.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await chooser.waitFor();
  await chooser.getByRole('button', {name: 'Open folder', exact: true}).waitFor();
  // Exercise reveal without supplying a path: only the active temporary library opens.
  const revealed = await api('/api/libraries/reveal', {path: path.join(root, 'original')});
  assert.equal(revealed.status, 200);
  await page.keyboard.press('Escape'); assert.equal(await chooser.count(), 0);
  await page.locator('.source-switcher').focus(); await page.keyboard.press('Enter'); await chooser.waitFor();
  await chooser.locator('.library-manager-list li').filter({hasText: 'Little Café'}).getByRole('button', {name: 'Open library', exact: true}).click();
  await chooser.waitFor({state: 'hidden', timeout: process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 60000});
  assert.equal((await (await fetch(origin + '/api/libraries/session')).json()).libraryRoot, demoSession.libraryRoot);
  // A migration that was not approved must restore the current source and explain the failure.
  const legacyRoot = path.join(root, 'legacy');
  await initEmptyLibrary(legacyRoot);
  const legacyDb = JSON.parse(await readFile(path.join(legacyRoot, 'db.json'), 'utf8'));
  delete legacyDb.schemaVersion;
  await writeFile(path.join(legacyRoot, 'db.json'), JSON.stringify(legacyDb));
  await page.locator('.source-switcher').click();
  await chooser.getByRole('button', {name: 'My documents', exact: false}).click();
  await chooser.getByRole('textbox', {name: 'Folder path', exact: true}).fill(legacyRoot);
  await chooser.getByRole('button', {name: 'Open library', exact: true}).click();
  await chooser.locator('[role=alert]').waitFor({timeout: process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 60000});
  assert.equal((await (await fetch(origin + '/api/libraries/session')).json()).libraryRoot, demoSession.libraryRoot);
  await stop();
  launch({DATA_DIR: copied.libraryRoot, ATLAS_LOCAL_DESKTOP: '0'}); await ready();
  await page.goto(origin); await chooser.waitFor();
  assert.equal(await chooser.locator('.source-choice').count(), 0, 'fixed mode shows no unavailable choices');
  assert.equal(await chooser.getByRole('button', {name: 'Open folder', exact: true}).count(), 0);
  await chooser.getByRole('button', {name: 'Copy path', exact: true}).waitFor();
  await chooser.getByRole('button', {name: 'Continue reading', exact: true}).click();
  assert.equal(await chooser.count(), 0);
  console.log('PASS: source picker, desktop/mobile, demo reuse, import copy, stale sessions, locked/missing sources, unsaved draft, reveal, keyboard, fixed mode');
  }
} catch (error) {
  console.error(logs, error); throw error;
} finally {
  await browser?.close(); await stop();
  // root is exclusively created by this test under the system temporary directory.
  await rm(root, {recursive: true, force: true});
}
