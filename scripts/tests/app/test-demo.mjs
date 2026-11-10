import {browserOptions} from '../helpers/browser.mjs';
import '../helpers/environment.mjs';
import {appRequire} from '../../dependencies.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const {chromium,expect} = appRequire('@playwright/test');
import {seedDemo,demoRoot,sampleFiles} from '../../setup/seed-demo.mjs';

const root=await mkdtemp(path.join(tmpdir(),'atlas-cafe-test-'));
const restored=await mkdtemp(path.join(tmpdir(),'atlas-cafe-restore-'));
const children=[];let browser;
const port=Number(process.env.TEST_PORT||3217),origin=`http://127.0.0.1:${port}`;
const baseline=await Promise.all((await sampleFiles(demoRoot)).map(async f=>[f,await readFile(path.join(demoRoot,f))]));
async function server(dir,p){
 const boot=spawnSync(process.execPath,['../scripts/setup/bootstrap.mjs'],{env:{...process.env,DATA_DIR:dir},encoding:'utf8',windowsHide:true});assert.equal(boot.status,0,boot.stderr);
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(p)],{env:{...process.env,DATA_DIR:dir},stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(child);let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(`http://127.0.0.1:${p}/api/health`)).ok)return;}catch{}await delay(200);}throw Error('Server timeout: '+logs);
}
async function json(url){const r=await fetch(origin+url);assert.equal(r.status,200,await r.clone().text());return r.json();}
try{
 await seedDemo(root);await server(root,port);
 const docs=await json('/api/docs');assert.equal(docs.length,13);
 const links=await json('/api/links?id=menu/latte');assert.ok(links.incoming.length);assert.ok(links.outgoing.length);
 assert.equal((await json('/api/history?id=menu/latte')).versions.length,2);
 assert.equal((await json('/api/comments?docId=menu/latte')).length,1);
 browser=await chromium.launch({...browserOptions});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.context().addCookies([{name:'atlas-locale',value:'vi',url:origin}]);
 await page.route('https://cdn.jsdelivr.net/npm/monaco-editor*/**',async route=>{
  const suffix=new URL(route.request().url()).pathname.split('/min/vs/')[1];
  if(!suffix||suffix.includes('..'))return route.abort();
  await route.fulfill({path:path.resolve('node_modules/monaco-editor/min/vs',suffix),headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto(origin+'/docs/start/welcome');
 await expect(page.getByRole('heading',{name:'Welcome to Little Café',exact:true})).toBeVisible();
 await expect.poll(()=>page.locator('article img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/little-cafe-welcome.png',fullPage:true});
 await page.getByRole('button',{name:'Tiện ích',exact:true}).click();
 await page.getByRole('menuitem',{name:'Chuyển sang giao diện sáng',exact:true}).click();
 await expect.poll(async()=>(await json('/api/settings')).theme).toBe('light');
 await page.goto(origin+'/docs/operations/order-flow');await expect(page.locator('.diagram svg')).toBeVisible();
 await page.goto(origin+'/docs/ordering/openapi.yml');await expect(page.locator('.swagger-ui')).toBeVisible();
 await page.goto(origin+'/docs/ordering/schema.sql');await expect(page.locator('.react-flow')).toBeVisible();
 await page.goto(origin+'/docs/menu/latte');await expect(page.locator('article mark')).toHaveText('Use dairy milk or oat milk.');
 await page.getByRole('tab',{name:'Mục lục',exact:true}).click();
 await expect(page.locator('.toc-tree a[href="#shift-handover-note"]')).toHaveCount(0);
 await page.getByRole('button',{name:'Cấu hình mục lục',exact:true}).click();
 await page.getByRole('combobox',{name:'Đến cấp',exact:true}).click();
 await page.getByRole('option',{name:'H6',exact:true}).click();await page.keyboard.press('Escape');
 await page.locator('.toc-tree a[href="#shift-handover-note"]').click();
 await expect(page.locator('article #shift-handover-note')).toBeInViewport();
 await page.screenshot({path:'test-results/little-cafe-headings.png'});
 await page.getByRole('button',{name:'Thu gọn Quality check',exact:true}).click();
 await expect(page.locator('.toc-tree a[href="#shift-handover-note"]')).toHaveCount(0);
 await page.locator('.right-panel').getByRole('button',{name:'Mở tất cả',exact:true}).click();
 await expect(page.locator('.toc-tree a[href="#shift-handover-note"]')).toBeVisible();
 await page.getByRole('button',{name:'Sửa',exact:true}).click();
 for(const mode of ['Visual','Source','Split','Preview']){
  await page.getByRole('radio',{name:mode,exact:true}).click();
  if(mode==='Visual')await expect(page.locator('.tiptap-content h6')).toHaveText('Shift handover note');
  else if(mode==='Source')await expect(page.locator('.monaco-editor').first()).toBeVisible();
  else await expect(page.locator('.preview h6')).toHaveText('Shift handover note');
 }
 await page.goto(origin+'/docs/ordering/overview');
 await expect(page.locator('article .swagger-ui')).toBeVisible();
 await expect(page.locator('article .react-flow')).toBeVisible();
 await page.locator('article .react-flow').scrollIntoViewIfNeeded();
 await page.screenshot({path:'test-results/little-cafe-embedded.png'});
 await page.locator('article a[href="/docs/menu/latte"]').click();await expect(page).toHaveURL(origin+'/docs/menu/latte');
 await page.goto(origin+'/docs/ordering/overview');await page.getByRole('button',{name:'Sửa',exact:true}).click();
 await expect(page.getByRole('radio',{name:'Visual',exact:true})).toBeDisabled();
 for(const mode of ['Source','Split','Preview']){
  await page.getByRole('radio',{name:mode,exact:true}).click();
  if(mode==='Source')await expect(page.locator('.monaco-editor').first()).toBeVisible();
  else await expect(page.locator('.preview .swagger-ui')).toBeVisible();
 }
 // Inserting an edited image creates a copy; editing in /media replaces it.
 await page.goto(origin+'/docs/menu/latte');await page.getByRole('button',{name:'Sửa',exact:true}).click();
 await page.getByRole('radio',{name:'Source',exact:true}).click();
 await page.getByRole('button',{name:'Chèn tài nguyên',exact:true}).click();
 await page.getByRole('button',{name:'Xem latte-layers.png',exact:true}).click();
 await page.getByRole('button',{name:'Vẽ/chỉnh sửa',exact:true}).click();
 await expect(page.getByRole('button',{name:'Lưu và chèn',exact:true})).toBeEnabled();
 const canvas=page.getByLabel('Vùng vẽ trên ảnh');
 async function draw(){const box=await canvas.boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7,{steps:5});await page.mouse.up();}
 await page.locator('.image-tools button').filter({hasText:'Mùa vụ'}).click();await draw();
 await page.getByRole('button',{name:'Áp dụng cắt xén',exact:true}).click();
 await page.getByRole('button',{name:'Hoàn tác',exact:true}).click();
 await page.locator('.image-tools button').filter({hasText:'Vẽ'}).click();await draw();
 await page.locator('.image-tools').getByRole('button',{name:/^Chữ(?:\s|$)/}).click();
 await page.getByPlaceholder('Nhập văn bản, sau đó nhấp vào một vị trí trên hình ảnh').fill('Try oat milk');await canvas.click({position:{x:50,y:50}});
 await page.getByRole('button',{name:'Hoàn tác',exact:true}).click();await page.getByRole('button',{name:'Làm lại',exact:true}).click();
 await page.getByRole('button',{name:'Lưu và chèn',exact:true}).click();
 await expect.poll(async()=>(await json('/api/media')).length).toBe(6);
 const copy=(await json('/api/media')).find(a=>a.filename==='latte-layers-edited.png');assert.ok(copy);
 await page.getByRole('button',{name:'Lưu',exact:true}).click();
 await expect.poll(async()=>(await json('/api/docs/menu/latte')).raw.includes('/api/media/'+copy.id)).toBe(true);
 const originalAsset=JSON.parse(await readFile(path.join(demoRoot,'db.json'),'utf8')).assets.find(a=>a.filename==='latte-layers.png');
 assert.deepEqual(await readFile(path.join(root,'uploads',originalAsset.storedName)),await readFile(path.join(demoRoot,'uploads',originalAsset.storedName)));
 await page.goto(origin+'/media');
 for(const [file,tag] of [['service-chime.wav','audio'],['order-flow.mp4','video']]){
  await page.getByRole('button',{name:'Xem '+file,exact:true}).click();
  await expect.poll(()=>page.locator(tag).evaluate(el=>Number.isFinite(el.duration)&&el.duration>0)).toBe(true);
  await page.getByRole('button',{name:'Phát',exact:true}).click();
  await expect.poll(()=>page.locator(tag).evaluate(el=>el.currentTime)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
 }
 assert.deepEqual(errors,[]);
 await browser.close();browser=undefined;
 const detailEmpty=await json('/api/history?id=start/welcome&detail=1');
 assert.equal(detailEmpty.totalCount,0);assert.deepEqual(detailEmpty.items,[]);
 const folder=await fetch(origin+'/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parent:'',title:'History Lab',imageId:null})});
 if(folder.status!==200)throw Error(await folder.text());
 const created=await fetch(origin+'/api/docs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:'history-lab',title:'Trace',kind:'md'})});
 if(created.status!==200)throw Error(await created.text());
 const trace=(await created.json()).id;
 assert.equal((await json('/api/history?id='+trace)).versions.length,0,'new doc has empty history');
 const put=async raw=>{const r=await fetch(origin+'/api/docs/'+trace,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw})});if(r.status!==200)throw Error(await r.text());return r.json();};
 const rawA='---\ntitle: "Trace"\ndescription: ""\n---\n\n# A\n';
 const rawB='---\ntitle: "Trace"\ndescription: ""\n---\n\n# B\n';
 const rawC='---\ntitle: "Trace"\ndescription: ""\n---\n\n# C\n';
 await put(rawA);
 const baseCount=(await json('/api/history?id='+trace)).versions.length;
 await put(rawB);await put(rawC);await put(rawC);
 let versions=(await json('/api/history?id='+trace)).versions;
 assert.equal(versions.length,baseCount+2,'A→B→C then repeat C adds exactly two milestones');
 const revBodies=await Promise.all(versions.map(v=>json('/api/history?id='+trace+'&revision='+encodeURIComponent(v))));
 assert.equal(revBodies[0].raw,rawB);assert.equal(revBodies[1].raw,rawA);
 const detail=await json('/api/history?id='+trace+'&detail=1');
 assert.equal(detail.totalCount,versions.length);assert.equal(detail.items[0].reason,'edit');assert.ok(detail.items[0].sizeBytes>0);
 assert.equal((await json('/api/docs/'+trace)).raw,rawC);
 const conflict=await fetch(origin+'/api/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:trace,version:versions[1],baseHash:'0'.repeat(64)})});
 assert.equal(conflict.status,409);
 const version=(await json('/api/history?id=menu/latte')).versions[0];
 const old=(await json('/api/history?id=menu/latte&revision='+encodeURIComponent(version))).raw;
 const beforeRestore=(await json('/api/docs/menu/latte')).raw;
 const restore=await fetch(origin+'/api/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'menu/latte',version})});
 assert.equal(restore.status,200,await restore.text());
 assert.equal((await json('/api/docs/menu/latte')).raw,old);
 versions=(await json('/api/history?id=menu/latte')).versions;
 assert.ok(versions.length>2);
 const revisions=await Promise.all(versions.map(v=>json('/api/history?id=menu/latte&revision='+encodeURIComponent(v))));
 assert.ok(revisions.some(v=>v.raw===beforeRestore),'Restore preserves the previous document in history');
 const latteDetail=await json('/api/history?id=menu/latte&detail=1');
 assert.equal(latteDetail.items[0].reason,'restore');
 assert.ok(latteDetail.items.some(x=>x.reason===null),'legacy demo milestones stay readable without sidecar');
 const backup=await fetch(origin+'/api/backup');assert.equal(backup.status,200);const zip=await backup.arrayBuffer();
 await server(restored,port+1);
 const response=await fetch(`http://127.0.0.1:${port+1}/api/backup`,{method:'POST',headers:{'Content-Type':'application/zip'},body:Buffer.from(zip)});assert.equal(response.status,200,await response.text());
 // Process locks are not backup content and differ between the two running servers.
 for(const f of (await sampleFiles(root)).filter(f=>f!=='.atlas-docs.lock'))assert.deepEqual(await readFile(path.join(restored,f)),await readFile(path.join(root,f)),f);
 for(const [f,bytes] of baseline)assert.deepEqual(await readFile(path.join(demoRoot,f)),bytes,'Source demo changed: '+f);
 console.log('PASS: 13 docs, H2–H6 TOC, editor modes, embedded SQL/OpenAPI, wiki links, image-copy editing, history, comments, media playback, byte-for-byte backup restore; source demo unchanged');
}finally{
 if(browser)await browser.close();
 for(const child of children){child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});}
 await rm(root,{recursive:true,force:true});await rm(restored,{recursive:true,force:true});
}
