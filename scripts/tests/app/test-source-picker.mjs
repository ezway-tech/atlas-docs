import {browserOptions} from '../helpers/browser.mjs';
import {appRequire, appRoot, repoRoot} from '../../dependencies.mjs';
import assert from 'node:assert/strict';
import {access, mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {initEmptyLibrary, acquireLibraryLock, ensureRegistered} from '../../../app/src/library/index.mjs';

const {chromium} = appRequire('@playwright/test');
const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-picker-ui-'));
const port = Number(process.env.TEST_PORT || 3257);
const origin = `http://127.0.0.1:${port}`;
const output = path.join(appRoot, 'test-results/source-picker');
const emptyProject = path.join(root, 'empty-project');
const readyProject = path.join(root, 'ready-project');
const namedReadyProject = path.join(root, 'named-ready-project');
const env = {
  ...process.env,
  DATA_DIR: '',
  ATLAS_LIBRARY_MODE: 'manager',
  ATLAS_DIST_DIR: process.env.ATLAS_DIST_DIR || 'test-results/builds/source-picker',
  ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'registry'),
  ATLAS_DOCS_LIBRARIES_DIR: path.join(root, 'libraries'),
  ATLAS_DOCS_ALLOWED_ROOTS: root,
  ATLAS_DOCS_NO_UPDATE_CHECK: '1',
  ATLAS_LOCAL_DESKTOP: '1',
  ATLAS_DOCS_PICK_FOLDER_MOCK: '',
};
let child;
let browser;
let logs = '';

function launch(extra = {}) {
  child = spawn(
    process.execPath,
    [path.join(repoRoot, 'scripts/setup/source-start.mjs'), process.env.ATLAS_SOURCE_TEST_DEV ? 'dev' : 'start', '--port', String(port)],
    {cwd: appRoot, env: {...env, ...extra}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true},
  );
  child.stdout.on('data', b => {
    logs = (logs + b).slice(-16000);
  });
  child.stderr.on('data', b => {
    logs = (logs + b).slice(-16000);
  });
}

async function ready() {
  for (let i = 0; i < 180; i++) {
    if (child.exitCode !== null) throw Error(logs);
    try {
      if ((await fetch(origin + '/api/libraries/ready')).ok) return;
    } catch {}
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
  return fetch(origin + route, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Atlas-Library-Api': '1',
      'X-Atlas-Runtime': session.runtimeId,
      'X-Atlas-Library': session.libraryId,
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
}

async function waitSession(match, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const next = await (await fetch(origin + '/api/libraries/session')).json();
      if (match(next)) return next;
    } catch {
      // Runtime is restarting after a project switch.
    }
    await delay(250);
  }
  throw Error('Timed out waiting for project session');
}

async function gotoApp(page, path = '/workspace') {
  const url = origin + path;
  for (let i = 0; i < 8; i++) {
    try {
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      return;
    } catch {
      await delay(400);
    }
  }
  await page.goto(url, {waitUntil: 'domcontentloaded'});
}

try {
  await mkdir(path.join(root, 'libraries'), {recursive: true});
  await mkdir(emptyProject, {recursive: true});
  await initEmptyLibrary(readyProject);
  await mkdir(path.join(readyProject, 'docs', 'guide'), {recursive: true});
  await writeFile(
    path.join(readyProject, 'docs', 'guide', 'note.md'),
    '---\ntitle: Ready note\ndescription: ""\n---\n\n# Ready note\n',
  );
  await initEmptyLibrary(namedReadyProject);
  await mkdir(output, {recursive: true});

  launch();
  await ready();
  browser = await chromium.launch(browserOptions);
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  await page.context().addCookies([{name: 'atlas-locale', value: 'en', url: origin}]);
  page.setDefaultTimeout(process.env.ATLAS_SOURCE_TEST_DEV ? 120000 : 30000);
  page.setDefaultNavigationTimeout(process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 30000);
  const contentRequests=[];
  page.on('request',r=>{if(/\/api\/(docs|folders|order|dashboard|comments|links)(?:[/?]|$)/.test(r.url()))contentRequests.push(r.url());});
  await gotoApp(page, '/');

  const manager = page.getByRole('region', {name: 'Projects', exact: true});
  const browseForProject = () =>
    manager.locator('.project-toolbar').getByRole('button', {name: 'Browse for project', exact: true});
  await browseForProject().waitFor();
  await manager.getByRole('button', {name: 'Create project', exact: false}).waitFor();
  await manager.locator('[data-example=true]').waitFor();
  assert.equal(await manager.locator('.source-choices,.source-current').count(), 0);
  assert.equal(await manager.locator('.project-list li').first().getAttribute('data-example'), 'true');
  await page.screenshot({path: path.join(output, 'desktop.png')});
  const layoutBounds=await page.locator('.projects-layout').boundingBox();
  assert.ok(layoutBounds.width>=900,'Projects content uses a wide layout on desktop');
  assert.ok(layoutBounds.y>=0,'Projects content starts below the page header');
  assert.ok(await page.locator('.projects-page > .topbar').count(),'Projects page uses the shared top bar');
  assert.ok(await page.locator('.projects-split').count(),'Projects uses master-detail split');
  assert.ok(await page.locator('.project-detail').count(),'Projects shows a detail panel');
  assert.ok(await page.getByRole('searchbox',{name:'Search projects'}).count(),'Projects list has search');
  assert.equal(await page.locator('.app-shell,.sidebar,.ui-dialog-overlay').count(),0);
  assert.equal(contentRequests.length,0,'project page must not load document data');
  assert.ok(page.url().endsWith('/projects'));
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: path.join(output, 'mobile.png')});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.screenshot({path:path.join(output,'mobile-dark.png')});
  await page.setViewportSize({width: 1440, height: 900});
  await page.screenshot({path:path.join(output,'desktop-dark.png')});
  await page.evaluate(()=>document.documentElement.classList.remove('dark'));
  // Layout-only fixtures: do not create projects or modify the real registry.
  await page.evaluate(()=>{
    const list=document.querySelector('.project-list');
    const original=list.firstElementChild;
    for(let i=0;i<15;i++){
      const row=original.cloneNode(true);row.dataset.layoutFixture='true';
      const title=row.querySelector('strong');
      if(title)title.textContent='Long project name '.repeat(6);
      list.append(row);
    }
  });
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok((await page.locator('.projects-layout').boundingBox()).y>=0,'long lists keep their heading reachable');
  await page.locator('[data-layout-fixture]').last().scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'long-list-mobile.png')});
  await page.evaluate(()=>{document.querySelectorAll('[data-layout-fixture]').forEach(row=>row.remove());window.scrollTo(0,0);});
  await page.setViewportSize({width:1440,height:900});

  // Cancel native folder pick (mock).
  await stop();
  launch({ATLAS_DOCS_PICK_FOLDER_MOCK: '__cancel__'});
  await ready();
  await gotoApp(page, '/projects');
  await browseForProject().click();
  await delay(500);
  assert.ok(await manager.isVisible());
  assert.equal(await manager.locator('[role=alert]').count(), 0);

  // Example is registered at startup — wait until preparation finishes, then open from the detail panel.
  const exampleSelect = manager
    .locator('.project-list li')
    .filter({hasText: 'Example'})
    .locator('button.project-list-select');
  await exampleSelect.waitFor({state: 'visible'});
  for (let i = 0; i < 120 && (await exampleSelect.isDisabled()); i++) {
    await delay(500);
  }
  assert.equal(await exampleSelect.isDisabled(), false, 'Example row must finish preparing before open');
  await exampleSelect.click();
  await manager.locator('.project-detail').getByRole('button', {name: 'Open project', exact: true}).click();
  await page.waitForSelector('.source-switcher', {timeout: process.env.ATLAS_SOURCE_TEST_DEV ? 180000 : 60000});
  assert.equal(await manager.count(), 0, 'successful switch skips the project manager on load');
  const demoSession = await (await fetch(origin + '/api/libraries/session')).json();
  assert.equal(demoSession.displayName, 'Example');

  if (process.env.ATLAS_SOURCE_TEST_DEV) {
    console.log('PASS: development launcher, Projects page layout and Example switch');
  } else {
    await writeFile(path.join(demoSession.libraryRoot, 'docs', 'keep.txt'), 'example edit');
    await page.reload();
    await page.waitForSelector('.source-switcher');
    assert.equal(await manager.count(), 0, 'reload must not reopen the project manager');
    assert.match((await page.locator('.source-switcher').innerText()).replace(/\s+/g, ' ').trim(), /^Project\s*·\s*Example$/);
    assert.equal(await readFile(path.join(demoSession.libraryRoot, 'docs', 'keep.txt'), 'utf8'), 'example edit');
    // Switch to another project via API to mint a new runtime; previous session headers must 409.
    const staleSession = {...demoSession};
    const switched = await api('/api/libraries/open', {path: readyProject}, staleSession);
    assert.equal(switched.status, 202, await switched.clone().text());
    await waitSession(next => next.libraryRoot === readyProject && next.runtimeId !== staleSession.runtimeId);
    assert.equal((await api('/api/settings', null, staleSession)).status, 409, 'old sessions are refused');
    const live = await (await fetch(origin + '/api/libraries/session')).json();
    const back = await api('/api/libraries/demo', {}, live);
    assert.equal(back.status, 202, await back.clone().text());
    Object.assign(
      demoSession,
      await waitSession(next => next.displayName === 'Example' && next.runtimeId !== live.runtimeId),
    );
    await gotoApp(page);
    await page.waitForSelector('.source-switcher', {timeout: 60000});

    const lockedRoot = path.join(root, 'locked');
    await initEmptyLibrary(lockedRoot);
    const lock = await acquireLibraryLock(lockedRoot);
    try {
      assert.equal((await api('/api/libraries/open', {path: lockedRoot})).status, 409);
    } finally {
      await lock.release();
    }
    assert.equal((await api('/api/libraries/open', {path: path.join(root, 'missing')})).status, 409);

    // Open an unlisted ready project via mocked native picker — asks for display name.
    await stop();
    launch({
      ATLAS_LIBRARY_MODE: '',
      ATLAS_OPEN_LIBRARY: demoSession.libraryRoot,
      ATLAS_DOCS_PICK_FOLDER_MOCK: namedReadyProject,
    });
    await ready();
    await gotoApp(page);
    await page.waitForSelector('.source-switcher');
    await page.locator('.source-switcher').click();
    await manager.waitFor();
    await browseForProject().click();
    const openNameDialog = page.getByRole('dialog', {name: 'Name this project?', exact: true});
    await openNameDialog.waitFor();
    const nameInput = openNameDialog.locator('input.ui-input');
    assert.equal(await nameInput.inputValue(), 'named-ready-project');
    // Dialog focuses the field and selects the whole hint so typing replaces it.
    await nameInput.waitFor({state: 'visible'});
    for (let i = 0; i < 20; i++) {
      const allSelected = await nameInput.evaluate(
        el => el === document.activeElement && el.selectionStart === 0 && el.selectionEnd === el.value.length,
      );
      if (allSelected) break;
      await delay(50);
    }
    assert.ok(
      await nameInput.evaluate(
        el => el === document.activeElement && el.selectionStart === 0 && el.selectionEnd === el.value.length,
      ),
      'name field should be focused with the whole hint selected',
    );
    await nameInput.pressSequentially('Ready Custom');
    assert.equal(await nameInput.inputValue(), 'Ready Custom');
    await nameInput.press('Enter');
    const opened = await waitSession(
      next => next.libraryRoot === namedReadyProject && next.displayName === 'Ready Custom',
    );
    await gotoApp(page, '/workspace');
    await page.waitForSelector('.source-switcher', {timeout: 60000});
    assert.equal(opened.libraryRoot, namedReadyProject);
    assert.equal(opened.displayName, 'Ready Custom');

    // Browsing a listed project again skips the name dialog.
    await page.locator('.source-switcher').click();
    await manager.waitFor();
    await browseForProject().click();
    await waitSession(next => next.libraryRoot === namedReadyProject && next.displayName === 'Ready Custom');
    await gotoApp(page, '/workspace');
    await page.waitForSelector('.source-switcher', {timeout: 60000});
    assert.equal(await openNameDialog.count(), 0);
    assert.equal((await (await fetch(origin + '/api/libraries/session')).json()).displayName, 'Ready Custom');

    // Empty folder requires confirm initialize with a display name.
    await stop();
    launch({
      ATLAS_LIBRARY_MODE: '',
      ATLAS_OPEN_LIBRARY: namedReadyProject,
      ATLAS_DOCS_PICK_FOLDER_MOCK: emptyProject,
    });
    await ready();
    await gotoApp(page);
    await page.waitForSelector('.source-switcher');
    await page.locator('.source-switcher').click();
    await manager.waitFor();
    await browseForProject().click();
    const emptyDialog = page.getByRole('dialog', {name: 'Create project here?', exact: true});
    await emptyDialog.waitFor();
    assert.equal(await emptyDialog.locator('input').inputValue(), 'empty-project');
    await emptyDialog.getByRole('button', {name: 'Cancel', exact: true}).click();
    assert.equal((await (await fetch(origin + '/api/libraries/session')).json()).libraryRoot, namedReadyProject);
    // Manager stays open after cancelling the empty-folder confirm.
    await browseForProject().click();
    await emptyDialog.waitFor();
    await emptyDialog.locator('input.ui-input').fill('Empty Custom');
    await emptyDialog.getByRole('button', {name: 'Create project here', exact: true}).click();
    const emptyOpened = await waitSession(
      next => next.libraryRoot === emptyProject && next.displayName === 'Empty Custom',
    );
    await gotoApp(page, '/workspace');
    await page.waitForSelector('.source-switcher', {timeout: 60000});
    assert.equal(emptyOpened.libraryRoot, emptyProject);
    assert.equal(emptyOpened.displayName, 'Empty Custom');
    assert.ok(await readFile(path.join(emptyProject, 'db.json'), 'utf8'));

    // Invalid non-project folder: clear error, no mutate.
    const junk = path.join(root, 'junk');
    await mkdir(junk, {recursive: true});
    await writeFile(path.join(junk, 'notes.txt'), 'not a project');
    await stop();
    launch({
      ATLAS_LIBRARY_MODE: '',
      ATLAS_OPEN_LIBRARY: emptyProject,
      ATLAS_DOCS_PICK_FOLDER_MOCK: junk,
    });
    await ready();
    await gotoApp(page);
    await page.waitForSelector('.source-switcher');
    await page.locator('.source-switcher').click();
    await manager.waitFor();
    await browseForProject().click();
    await manager.locator('[role=alert]').waitFor();
    assert.equal(await readFile(path.join(junk, 'notes.txt'), 'utf8'), 'not a project');

    // Unsaved draft cancel keeps draft.
    await stop();
    launch({ATLAS_LIBRARY_MODE: '', ATLAS_OPEN_LIBRARY: readyProject, ATLAS_DOCS_PICK_FOLDER_MOCK: ''});
    await ready();
    await gotoApp(page, '/docs/guide/note');
    await page.waitForSelector('.source-switcher');
    if (await manager.count()) await page.keyboard.press('Escape');
    await page.getByRole('button', {name: 'Edit', exact: true}).waitFor({timeout: 60000});
    assert.equal(await manager.count(), 0);
    await page.reload();
    await page.getByRole('button', {name: 'Edit', exact: true}).waitFor();
    assert.ok(page.url().endsWith('/docs/guide/note'),'document reload keeps its URL');
    await page.getByRole('button', {name: 'Edit', exact: true}).click();
    await page.getByRole('radio', {name: 'Visual', exact: true}).click();
    await page.locator('.tiptap[contenteditable=true]').fill('Unsaved document');
    await page.locator('.source-switcher').click();
    const discard = page.getByRole('dialog', {name: 'Discard changes', exact: true});
    await discard.getByRole('button', {name: 'Cancel', exact: true}).click();
    assert.equal(await manager.count(), 0);
    assert.ok((await page.locator('.tiptap[contenteditable=true]').innerText()).includes('Unsaved document'));
    await page.locator('.source-switcher').click();
    await discard.getByRole('button', {name: 'Discard changes', exact: true}).click();
    await manager.waitFor();
    await manager.locator('.current').getByRole('button', {name: /Actions for/}).click();
    await page.getByRole('menuitem', {name: 'Open in Explorer', exact: true}).waitFor();
    await page.keyboard.press('Escape');
    const runtimeBeforeEnter=(await (await fetch(origin+'/api/libraries/session')).json()).runtimeId;
    const revealed = await api('/api/libraries/reveal', {});
    assert.equal(revealed.status, 200);
    await manager.locator('.current .project-list-select').click();
    await manager.locator('.project-detail').getByRole('button', {name: 'Open project', exact: true}).click();
    await page.waitForSelector('.source-switcher');
    assert.equal(await manager.count(), 0);
    assert.equal((await (await fetch(origin+'/api/libraries/session')).json()).runtimeId,runtimeBeforeEnter,'entering current project does not restart runtime');
    await page.goBack();
    await manager.waitFor();
    assert.equal(await page.locator('.app-shell').count(),0);
    await page.goForward();
    await page.waitForSelector('.source-switcher');
    await page.locator('.source-switcher').focus();
    await page.keyboard.press('Enter');
    await manager.waitFor();
    await manager.locator('.project-list li').filter({hasText: 'Example'}).getByRole('button').first().click();
    await manager.locator('.project-detail').getByRole('button', {name: 'Open project', exact: true}).click();
    const exampleAgain = await waitSession(next => next.displayName === 'Example');
    assert.equal(exampleAgain.libraryRoot, demoSession.libraryRoot);
    Object.assign(demoSession, exampleAgain);

    // Migration cancel restores previous project.
    const legacyRoot = path.join(root, 'legacy');
    await initEmptyLibrary(legacyRoot);
    const legacyDb = JSON.parse(await readFile(path.join(legacyRoot, 'db.json'), 'utf8'));
    delete legacyDb.schemaVersion;
    await writeFile(path.join(legacyRoot, 'db.json'), JSON.stringify(legacyDb));
    await stop();
    launch({
      ATLAS_LIBRARY_MODE: '',
      ATLAS_OPEN_LIBRARY: demoSession.libraryRoot,
      ATLAS_DOCS_PICK_FOLDER_MOCK: legacyRoot,
    });
    await ready();
    await gotoApp(page);
    await page.waitForSelector('.source-switcher');
    await page.locator('.source-switcher').click();
    await manager.waitFor();
    await browseForProject().click();
    const legacyNameDialog = page.getByRole('dialog', {name: 'Name this project?', exact: true});
    await legacyNameDialog.waitFor();
    await legacyNameDialog.getByRole('button', {name: 'Open project', exact: true}).click();
    await manager.locator('[role=alert]').waitFor({timeout: 60000});
    assert.equal((await (await fetch(origin + '/api/libraries/session')).json()).libraryRoot, demoSession.libraryRoot);

    // Missing path: relocate / remove from list.
    const gone = path.join(root, 'gone-project');
    await initEmptyLibrary(gone);
    const liveForGone = await (await fetch(origin + '/api/libraries/session')).json();
    const openGone = await api('/api/libraries/open', {path: gone, displayName: 'Gone'}, liveForGone);
    assert.equal(openGone.status, 202, await openGone.clone().text());
    await waitSession(next => next.libraryRoot === gone);
    // Wait until the supervisor records the open in the registry (happens just after Ready).
    for (let i = 0; i < 40; i++) {
      const listed = await (await api('/api/libraries/recent')).json();
      if ((listed.libraries || []).some(item => item.path === gone || item.displayName === 'Gone')) break;
      await delay(250);
    }
    await stop();
    await rm(gone, {recursive: true, force: true});
    for(let i=0;i<9;i++) await ensureRegistered(path.join(root,'missing-'+i),{displayName:'Missing '+i,env});
    launch({ATLAS_LIBRARY_MODE: 'manager', ATLAS_OPEN_LIBRARY: ''});
    await ready();
    await gotoApp(page);
    await manager.waitFor();
    await manager.locator('.project-missing-summary').waitFor();
    const missingDialog=page.getByRole('dialog',{name:'Missing locations',exact:true});
    assert.equal(await missingDialog.count(),0);
    await page.screenshot({path:path.join(output,'missing-collapsed.png')});
    await manager.getByRole('button',{name:'Manage',exact:true}).click();
    await missingDialog.waitFor();
    assert.equal(await missingDialog.locator('li').count(),10);
    const dialogBounds=await missingDialog.boundingBox();
    assert.ok(dialogBounds.height<=852);
    await page.screenshot({path:path.join(output,'missing-dialog-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await missingDialog.locator('li').last().scrollIntoViewIfNeeded();
    const headingBounds=await missingDialog.locator('h2').filter({hasText: 'Missing locations ('}).boundingBox();
    assert.ok(headingBounds.y>=0 && headingBounds.y<844);
    await page.screenshot({path:path.join(output,'missing-dialog-mobile.png')});
    await page.setViewportSize({width:1440,height:900});
    await missingDialog.getByRole('button',{name:'Actions for Gone',exact:true}).click();
    await page.getByRole('menuitem',{name:'Choose location again',exact:true}).waitFor();
    await page.keyboard.press('Escape');
    const listed=await (await api('/api/libraries/recent')).json();
    await missingDialog.getByRole('button',{name:'Remove all missing entries',exact:true}).click();
    const confirmation=page.getByRole('dialog',{name:'Remove all missing entries',exact:true});
    await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await missingDialog.locator('li').count(),10);
    await missingDialog.getByRole('button',{name:'Remove all missing entries',exact:true}).click();
    await confirmation.getByRole('button',{name:'Remove all missing entries',exact:true}).click();
    await missingDialog.getByText('No missing locations.',{exact:true}).waitFor();
    const afterRemoval=await (await api('/api/libraries/recent')).json();
    assert.equal(afterRemoval.missing.length,0);
    assert.deepEqual(afterRemoval.libraries.map(x=>x.id),listed.libraries.map(x=>x.id));
    assert.ok(await readFile(path.join(readyProject,'db.json'),'utf8'));
    await missingDialog.getByRole('button',{name:'Close',exact:true}).click();
    assert.equal(await manager.locator('.project-missing-summary').count(),0);

    // Selected project detail loads lightweight counts.
    await manager
      .locator('.project-list li')
      .filter({has: page.getByRole('button', {name: 'ready-project', exact: true})})
      .locator('button.project-list-select')
      .click();
    const stats = manager.locator('.project-detail-stats');
    await stats.waitFor({timeout: 30_000});
    let statsText = '';
    for (let i = 0; i < 60; i++) {
      statsText = await stats.innerText();
      if (/\d/.test(statsText)) break;
      await delay(500);
    }
    assert.match(statsText, /Documents/i);
    assert.match(statsText, /Topics/i);
    assert.match(statsText, /1/, `Project summary counts did not load: ${statsText}`);
    const summaryApi = await api('/api/libraries/summary', {path: readyProject});
    assert.equal(summaryApi.status, 200, await summaryApi.clone().text());
    const summaryBody = await summaryApi.json();
    assert.equal(summaryBody.counts.docs, 1);
    assert.equal(summaryBody.counts.topics, 1);
    assert.equal(summaryBody.counts.folders, 1);

    // Remove from list and Delete project folder both require confirmation.
    const removable = path.join(root, 'removable-project');
    const deletable = path.join(root, 'deletable-project');
    await initEmptyLibrary(removable);
    await initEmptyLibrary(deletable);
    await ensureRegistered(removable, {displayName: 'Removable', env});
    await ensureRegistered(deletable, {displayName: 'Deletable', env});
    await page.reload();
    await gotoApp(page);
    await manager.waitFor();
    await manager.locator('.project-list li').filter({hasText: 'Removable'}).waitFor({timeout: 30_000});
    await manager.locator('.project-list li').filter({hasText: 'Deletable'}).waitFor({timeout: 30_000});
    await manager.locator('.project-list li').filter({hasText: 'Removable'}).getByRole('button').first().click();
    await manager.locator('.project-detail').getByRole('button', {name: 'Remove from list', exact: true}).click();
    const removeConfirm = page.getByRole('dialog', {name: 'Remove from list', exact: true});
    await removeConfirm.waitFor();
    await removeConfirm.getByRole('button', {name: 'Cancel', exact: true}).click();
    assert.equal(await manager.locator('.project-list li').filter({hasText: 'Removable'}).count(), 1);
    await manager.locator('.project-detail').getByRole('button', {name: 'Remove from list', exact: true}).click();
    await removeConfirm.getByRole('button', {name: 'Remove from list', exact: true}).click();
    await manager.locator('.project-list li').filter({hasText: 'Removable'}).waitFor({state: 'detached'});
    assert.ok(await readFile(path.join(removable, 'db.json'), 'utf8'));

    await manager.locator('.project-list li').filter({hasText: 'Deletable'}).getByRole('button').first().click();
    await manager.locator('.project-detail').getByRole('button', {name: 'Delete project folder', exact: true}).click();
    const deleteConfirm = page.getByRole('dialog', {name: 'Delete project folder', exact: true});
    await deleteConfirm.waitFor();
    await deleteConfirm.getByRole('button', {name: 'Cancel', exact: true}).click();
    assert.ok(await readFile(path.join(deletable, 'db.json'), 'utf8'));
    await manager.locator('.project-detail').getByRole('button', {name: 'Delete project folder', exact: true}).click();
    await deleteConfirm.getByRole('button', {name: 'Delete project folder', exact: true}).click();
    await manager.locator('.project-list li').filter({hasText: 'Deletable'}).waitFor({state: 'detached'});
    await assert.rejects(() => access(deletable), {code: 'ENOENT'});

    await stop();
    launch({ATLAS_OPEN_LIBRARY: readyProject, ATLAS_LOCAL_DESKTOP: '0', ATLAS_LIBRARY_MODE: ''});
    await ready();
    await page.goto(origin + '/projects');
    await manager.waitFor();
    const capabilities = await api('/api/libraries/capabilities');
    const capBody = await capabilities.json();
    assert.equal(capBody.canSwitch, true);
    assert.equal(capBody.canCreate, true);
    assert.equal(capBody.canPickFolder, false);

    console.log(
      'PASS: project manager, Example, reload, open/create empty, invalid folder, cancel pick, missing list, remove/delete confirm, draft, reveal, keyboard, managed non-desktop startup',
    );
  }
} catch (error) {
  const failedPage = browser?.contexts()[0]?.pages()[0];
  if (failedPage) {await failedPage.screenshot({path: path.join(output, 'failure.png')}); console.error(await failedPage.locator('body').innerText());}
  console.error(logs, error);
  throw error;
} finally {
  await browser?.close();
  await stop();
  await rm(root, {recursive: true, force: true});
}
