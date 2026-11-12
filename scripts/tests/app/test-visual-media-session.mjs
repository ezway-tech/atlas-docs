import {browserOptions} from '../helpers/browser.mjs';
import '../helpers/environment.mjs';
import {appRequire} from '../../dependencies.mjs';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {seedDemo} from '../../setup/seed-demo.mjs';

const {chromium, expect} = appRequire('@playwright/test');

const root = await mkdtemp(path.join(tmpdir(), 'atlas-visual-media-'));
await seedDemo(root);

const port = Number(process.env.TEST_PORT || 3241);
const origin = `http://127.0.0.1:${port}`;
const runtimeId = 'visual-media-rt';
const libraryId = 'visual-media-lib';
const appCwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../app');

const children = [];
let browser;

function sessionEnv(extra = {}) {
  return {
    ...process.env,
    DATA_DIR: root,
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    // Same shape as managed npm CLI child: missing media session → 409.
    ATLAS_LIBRARY_MANAGER: '1',
    ATLAS_LIBRARY_MODE: 'library',
    ATLAS_RUNTIME_ID: runtimeId,
    ATLAS_LIBRARY_ID: libraryId,
    ...extra,
  };
}

async function startServer() {
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {cwd: appCwd, env: sessionEnv(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true},
  );
  children.push(child);
  let logs = '';
  child.stdout.on('data', b => { logs += b; });
  child.stderr.on('data', b => { logs += b; });
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error('Server exited: ' + logs);
    try {
      if ((await fetch(origin + '/api/health')).ok) return child;
    } catch {}
    await delay(250);
  }
  throw Error('Server timeout: ' + logs);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) {
    // Still clear a leftover lock so the next start can open the library.
  } else {
    const exited = new Promise(resolve => child.once('exit', resolve));
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true});
    } else {
      child.kill('SIGINT');
    }
    await Promise.race([exited, delay(15000)]);
    const idx = children.indexOf(child);
    if (idx >= 0) children.splice(idx, 1);
  }
  // Next may leave a worker holding .atlas-docs.lock after the wrapper exits.
  try {
    const lockPath = path.join(root, '.atlas-docs.lock');
    const raw = await readFile(lockPath, 'utf8');
    const lock = JSON.parse(raw);
    if (lock?.pid) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(lock.pid), '/T', '/F'], {windowsHide: true});
      } else {
        try {
          process.kill(lock.pid, 'SIGTERM');
        } catch {}
      }
    }
    await rm(lockPath, {force: true});
  } catch {}
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(origin + '/api/health', {signal: AbortSignal.timeout(500)});
    } catch {
      return;
    }
    await delay(200);
  }
}

async function assertMediaImgs(page, selector) {
  const imgs = page.locator(selector);
  await expect(imgs.first()).toBeVisible();
  const count = await imgs.count();
  assert.ok(count > 0, `expected media images for ${selector}`);
  for (let i = 0; i < count; i++) {
    const img = imgs.nth(i);
    const src = await img.getAttribute('src');
    assert.ok(src && src.includes('/api/media/'), `src ${src}`);
    assert.ok(/[?&]rt=/.test(src), `missing rt in ${src}`);
    assert.ok(/[?&]lib=/.test(src), `missing lib in ${src}`);
    assert.ok(src.includes(`rt=${encodeURIComponent(runtimeId)}`) || src.includes(`rt=${runtimeId}`), src);
    assert.ok(src.includes(`lib=${encodeURIComponent(libraryId)}`) || src.includes(`lib=${libraryId}`), src);
    await expect.poll(async () => img.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
  }
}

try {
  let server = await startServer();

  // Bare media GET must 409 when session env is published.
  {
    const bare = await fetch(origin + '/api/media/cafe0000-0000-4000-8000-000000000002');
    assert.equal(bare.status, 409);
    const ok = await fetch(
      origin +
        '/api/media/cafe0000-0000-4000-8000-000000000002?rt=' +
        encodeURIComponent(runtimeId) +
        '&lib=' +
        encodeURIComponent(libraryId),
    );
    assert.equal(ok.status, 200, await ok.clone().text());
  }

  browser = await chromium.launch({...browserOptions});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'en-US'});
  await context.addCookies([{name: 'atlas-locale', value: 'en', url: origin}]);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(origin + '/docs/menu/latte');
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
  await assertMediaImgs(page, 'article img[src*="/api/media/"]');

  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  await expect(page.locator('.tiptap-content')).toBeVisible();
  await assertMediaImgs(page, '.tiptap-content img[src*="/api/media/"]');

  // Edit a text paragraph (not the image — clicking an image then typing replaces it).
  const milk = page.locator('.tiptap-content p').filter({hasText: 'Use dairy milk'});
  await milk.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Visual media session check.');
  // Image must still be present in the editor after the text edit.
  await assertMediaImgs(page, '.tiptap-content img[src*="/api/media/"]');
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await expect.poll(async () => {
    const raw = await readFile(path.join(root, 'docs', 'menu', 'latte.md'), 'utf8');
    return raw.includes('Visual media session check');
  }).toBe(true);

  const saved = await readFile(path.join(root, 'docs', 'menu', 'latte.md'), 'utf8');
  assert.ok(!/[?&]rt=/.test(saved), 'markdown must not persist rt; got:\n' + saved.slice(0, 800));
  assert.ok(!/[?&]lib=/.test(saved), 'markdown must not persist lib; got:\n' + saved.slice(0, 800));
  assert.ok(
    saved.includes('/api/media/cafe0000-0000-4000-8000-000000000002'),
    'saved markdown must keep media links; got:\n' + saved,
  );

  await browser.close();
  browser = undefined;
  await stopServer(server);

  // Restart same library with new runtime id (session changes each run).
  const restartedRuntime = 'visual-media-rt-2';
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: appCwd,
      env: sessionEnv({ATLAS_RUNTIME_ID: restartedRuntime}),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  children.push(child);
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error('Restart exited');
    try {
      if ((await fetch(origin + '/api/health')).ok) break;
    } catch {}
    if (i === 119) throw Error('Restart timeout');
    await delay(250);
  }
  server = child;

  browser = await chromium.launch({...browserOptions});
  const context2 = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'en-US'});
  await context2.addCookies([{name: 'atlas-locale', value: 'en', url: origin}]);
  const page2 = await context2.newPage();
  page2.setDefaultTimeout(30000);

  await page2.goto(origin + '/docs/menu/latte');
  await expect(page2.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
  // Wait until session is stamped (peekAtlasSession may be empty on first paint).
  await expect
    .poll(async () => page2.locator('article img[src*="/api/media/"]').first().getAttribute('src'), {timeout: 20000})
    .toMatch(new RegExp(`rt=${restartedRuntime}`));
  const readerSrc = await page2.locator('article img[src*="/api/media/"]').first().getAttribute('src');
  const mediaResp = await page2.request.get(origin + readerSrc);
  assert.equal(mediaResp.status(), 200, await mediaResp.text());
  await expect
    .poll(async () => page2.locator('article img[src*="/api/media/"]').first().evaluate(el => el.complete && el.naturalWidth > 0), {
      timeout: 20000,
    })
    .toBe(true);

  await page2.getByRole('button', {name: 'Edit', exact: true}).click();
  await expect
    .poll(async () => page2.locator('.tiptap-content img[src*="/api/media/"]').first().getAttribute('src'), {timeout: 20000})
    .toMatch(new RegExp(`rt=${restartedRuntime}`));
  const visualSrc = await page2.locator('.tiptap-content img[src*="/api/media/"]').first().getAttribute('src');
  assert.ok(visualSrc.includes(`lib=${libraryId}`) || visualSrc.includes(`lib=${encodeURIComponent(libraryId)}`), visualSrc);
  await expect
    .poll(async () => page2.locator('.tiptap-content img[src*="/api/media/"]').first().evaluate(el => el.complete && el.naturalWidth > 0), {
      timeout: 20000,
    })
    .toBe(true);

  const diskAgain = await readFile(path.join(root, 'docs', 'menu', 'latte.md'), 'utf8');
  assert.ok(!/[?&]rt=/.test(diskAgain));
  assert.ok(!/[?&]lib=/.test(diskAgain));

  console.log('PASS: visual editor media session stamp; markdown stays bare across restart');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [...children]) {
    await stopServer(child).catch(() => {});
  }
  await rm(root, {recursive: true, force: true}).catch(() => {});
}
