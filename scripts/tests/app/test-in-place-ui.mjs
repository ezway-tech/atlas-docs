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
await writeFile(file,'# Getting started\n\nWelcome to the team handbook.\n');
await writeFile(path.join(project,'README.md'),'# Team handbook\n');
await writeFile(path.join(project,'maintenance.py'),'# A related project file\n');
const port=await freePort(), origin='http://127.0.0.1:'+port;
const child=spawn(process.execPath,[path.join(repoRoot,'scripts/setup/source-start.mjs'),'start','--port',String(port)],{cwd:appRoot,env:{
  ...process.env,DATA_DIR:'',ATLAS_DIST_DIR:'.next-npm-release',ATLAS_DOCS_REGISTRY_DIR:path.join(root,'registry'),ATLAS_DOCS_LIBRARIES_DIR:path.join(root,'libraries'),
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
  const doc=page.getByRole('button',{name:'Getting started.md',exact:true});
  await doc.click();await page.getByRole('heading',{name:'Getting started',exact:true}).waitFor();
  await capture('folder-project-tree',doc);
  assert.equal(await page.getByRole('button',{name:'maintenance.py'}).isDisabled(),true);
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Document text'});
  await editor.fill('# Getting started\n\nBring your project notes here.');
  const save=page.getByRole('button',{name:'Save',exact:true});await capture('folder-project-edit',save);
  await writeFile(file,'# Changed outside Atlas');
  await save.click();await page.getByRole('heading',{name:'File changed on disk'}).waitFor();
  assert.equal(await readFile(file,'utf8'),'# Changed outside Atlas');
  await page.getByRole('button',{name:'Keep editing against this version'}).click();
  await save.click();await page.getByText('Bring your project notes here.',{exact:true}).waitFor();
  assert.match(await readFile(file,'utf8'),/Bring your project/);
  await page.reload();await doc.click();
  if(!process.argv.includes('--preview')){
    await page.getByRole('button',{name:'History',exact:true}).click();
    await page.getByRole('button',{name:/Open revision from/}).first().click();
    assert.equal(await editor.inputValue(),'# Changed outside Atlas');
  }
  console.log('PASS: folder picker, nested tree, unsupported file, original edits, conflict, reload');
}catch(e){console.error(logs);throw e;}finally{await browser?.close();if(child.exitCode===null){child.send('atlas:stop');await new Promise(resolve=>child.once('exit',resolve));}}
