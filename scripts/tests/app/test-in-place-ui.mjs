import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {appRequire,appRoot,repoRoot} from '../../dependencies.mjs';
import {freePort} from '../helpers/package-harness.mjs';

const root=await mkdtemp(path.join(tmpdir(),'atlas-folder-ui-'));
const project=path.join(root,'Team handbook');
await mkdir(path.join(project,'Guides'),{recursive:true});
const file=path.join(project,'Guides','Getting started.md');
await writeFile(file,'---\ntitle: Getting started\norder: 2\n---\n\n# Getting started\n\nWelcome to the team handbook.\n');
await writeFile(path.join(project,'README.md'),'# Team handbook\n');
await writeFile(path.join(project,'maintenance.py'),'# A related project file\n');
const port=await freePort(), origin='http://127.0.0.1:'+port;
const child=spawn(process.execPath,[path.join(repoRoot,'scripts/setup/source-start.mjs'),'start','--port',String(port)],{cwd:appRoot,env:{
  ...process.env,DATA_DIR:'',ATLAS_DIST_DIR:process.env.ATLAS_DIST_DIR||'.next-npm-release',ATLAS_DOCS_REGISTRY_DIR:path.join(root,'registry'),ATLAS_DOCS_LIBRARIES_DIR:path.join(root,'libraries'),
  ATLAS_DOCS_ALLOWED_ROOTS:root,ATLAS_LOCAL_DESKTOP:'1',ATLAS_DOCS_PICK_FOLDER_MOCK:project,ATLAS_DOCS_NO_UPDATE_CHECK:'1'
},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
let logs='',browser;
child.stdout.on('data',chunk=>{logs+=chunk;});child.stderr.on('data',chunk=>{logs+=chunk;});
try{
  for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(origin+'/api/health')).ok)break;}catch{}await delay(300);}
  browser=await appRequire('@playwright/test').chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1150,height:720},locale:'en-US'});
  page.setDefaultTimeout(25000);
  await page.goto(origin+'/projects');
  async function capture(name,locator){
    if(!process.argv.includes('--capture'))return;
    await locator.evaluate(el=>{el.style.outline='3px solid #cf452d';el.style.outlineOffset='3px';});
    await page.screenshot({path:path.join(repoRoot,'guides/assets/'+name+'.png')});
    await locator.evaluate(el=>{el.style.outline='';el.style.outlineOffset='';});
  }
  const browse=page.getByRole('button',{name:'Browse for project',exact:true});
  await browse.waitFor();await capture('open-existing-folder',browse);await browse.click();
  const docRequest=page.waitForRequest(req=>req.url().includes('/api/docs/project/'));
  const doc=page.locator('a[href*="Getting"]').first();
  await doc.click();
  await page.locator('.markdown-body').getByText('Welcome to the team handbook.').waitFor();
  assert.doesNotMatch(await page.locator('.markdown-body').innerText(), /order: 2/);
  await capture('folder-project-tree',doc);
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();
  await page.locator('.editor-top').waitFor();
  const save=page.getByRole('button',{name:'Save',exact:true}).first();
  await capture('folder-project-edit',save);
  assert.match(await readFile(file,'utf8'),/order: 2/);
  const request=await docRequest;
  const original=await (await request.response()).json();
  const headers=await request.allHeaders();
  const api=async(url,method='GET',payload)=>page.request.fetch(origin+url,{method,headers:{
    'X-Atlas-Runtime':headers['x-atlas-runtime'],'X-Atlas-Library':headers['x-atlas-library'],
    'Content-Type':'application/json',Origin:origin},data:payload});
  const endpoint='/api/docs/'+original.id;
  await writeFile(file,original.raw+'External edit.');
  assert.equal((await api(endpoint,'PUT',{version:original.version,raw:'stale draft'})).status(),409);
  const current=await (await api(endpoint)).json();
  const raw=current.raw+' Saved in Atlas.';
  const saved=await api(endpoint,'PUT',{version:current.version,raw});
  assert.equal(saved.status(),200,await saved.text());
  assert.equal(await readFile(file,'utf8'),raw);
  const revisions=await (await api('/api/history?detail=1&id='+encodeURIComponent(original.id))).json();
  assert.equal(revisions.totalCount,1);
  const restored=await api('/api/history','POST',{id:original.id,version:revisions.items[0].id,baseHash:(await saved.json()).version});
  assert.equal(restored.status(),200,await restored.text());
  assert.equal(await readFile(file,'utf8'),current.raw);
  const comment=await api('/api/comments','POST',{docId:original.id,content:'Reviewed'});
  assert.equal(comment.status(),200,await comment.text());
  console.log('PASS: real workspace picker, nested document, front matter, editor');
}catch(e){console.error(logs);throw e;}finally{await browser?.close();if(child.exitCode===null){child.send('atlas:stop');await new Promise(resolve=>child.once('exit',resolve));}}
