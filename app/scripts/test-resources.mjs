import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {ASSET_TYPES,MAX_ASSET_SIZE,validateAsset} from '../src/lib/assets.ts';
const root=await mkdtemp(path.join(tmpdir(),'atlas-resources-'));
const restoreRoot=await mkdtemp(path.join(tmpdir(),'atlas-resources-restore-'));
const port=Number(process.env.TEST_PORT||3197),origin=`http://127.0.0.1:${port}`;
const children=[];
async function server(dir,p){
 const boot=spawnSync(process.execPath,['scripts/bootstrap.mjs'],{env:{...process.env,DATA_DIR:dir},encoding:'utf8',windowsHide:true});assert.equal(boot.status,0,boot.stderr);
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(p)],{env:{...process.env,DATA_DIR:dir,ATLAS_DIST_DIR:process.env.ATLAS_DIST_DIR||'.next'},stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(child);let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{const r=await fetch(`http://127.0.0.1:${p}/api/health`);if(r.ok)return;}catch{}await delay(200);}throw Error('Server timeout: '+logs);
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV5sAAAAASUVORK5CYII=','base64');
async function upload(name,type,bytes=Buffer.from('resource fixture')){const body=new FormData();body.set('file',new File([bytes],name,{type}));return fetch(origin+'/api/media',{method:'POST',body});}
async function json(url,method,body){return fetch(origin+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
try{
 await server(root,port);
 const assets=[];
 for(const [ext,mime] of Object.entries(ASSET_TYPES)){const r=await upload(`tài liệu.${ext}`,mime,ext==='png'?png:undefined);assert.equal(r.status,200,await r.clone().text());assets.push(await r.json());}
 assert.equal((await (await fetch(origin+'/api/media')).json()).length,assets.length);
 assert.equal((await upload('bad.exe','application/octet-stream')).status,400);
 assert.equal((await upload('bad.png','text/plain')).status,400);
 assert.equal((await upload('empty.txt','text/plain',Buffer.alloc(0))).status,400);
 const generic=await upload('generic.pdf','application/octet-stream');assert.equal(generic.status,200);assert.equal((await generic.json()).mimeType,'application/pdf');
 validateAsset({name:'limit.txt',type:'text/plain',size:MAX_ASSET_SIZE});
 assert.throws(()=>validateAsset({name:'limit.txt',type:'text/plain',size:MAX_ASSET_SIZE+1}));
 const large=await upload('limit.txt','text/plain',Buffer.alloc(MAX_ASSET_SIZE,65));assert.equal(large.status,200);const largeAsset=await large.json();
 assert.equal((await upload('too-large.txt','text/plain',Buffer.alloc(MAX_ASSET_SIZE+1,65))).status,400);
 await fetch(origin+'/api/media/'+largeAsset.id,{method:'DELETE'});
 const photo=assets.find(a=>a.mimeType==='image/png'),text=assets.find(a=>a.mimeType==='text/plain'),video=assets.find(a=>a.mimeType==='video/mp4');
 const editedForm=new FormData();editedForm.set('file',new File([png],'original-edited.png',{type:'image/png'}));editedForm.set('alt','Chú thích giữ nguyên');
 const copiedResponse=await fetch(origin+'/api/media',{method:'POST',body:editedForm});assert.equal(copiedResponse.status,200);const copied=await copiedResponse.json();assert.notEqual(copied.id,photo.id);assert.equal(copied.alt,'Chú thích giữ nguyên');assert.equal(copied.filename,'original-edited.png');assert.equal(photo.source,'upload');assert.equal(copied.source,'upload');
 const pasteForm=new FormData();pasteForm.set('file',new File([png],'anh-dan.png',{type:'image/png'}));pasteForm.set('alt','Ảnh dán');pasteForm.set('source','paste');
 const pasteResponse=await fetch(origin+'/api/media',{method:'POST',body:pasteForm});assert.equal(pasteResponse.status,200,await pasteResponse.clone().text());const pasted=await pasteResponse.json();assert.equal(pasted.source,'paste');assert.equal(pasted.filename,'anh-dan.png');assert.equal(pasted.alt,'Ảnh dán');
 const badSource=new FormData();badSource.set('file',new File([png],'nguon-sai.png',{type:'image/png'}));badSource.set('source','folder');
 assert.equal((await (await fetch(origin+'/api/media',{method:'POST',body:badSource})).json()).source,'upload');
 const invalidAlt=new FormData();invalidAlt.set('file',new File([png],'bad-alt.png',{type:'image/png'}));invalidAlt.set('alt','x'.repeat(301));assert.equal((await fetch(origin+'/api/media',{method:'POST',body:invalidAlt})).status,400);
 const photoResponse=await fetch(origin+'/api/media/'+photo.id);assert.deepEqual(Buffer.from(await photoResponse.arrayBuffer()),png);
 const download=await fetch(origin+'/api/media/'+photo.id+'?download=1');assert.match(download.headers.get('content-disposition'),/^attachment/);assert.match(download.headers.get('content-disposition'),/filename\*=UTF-8''/);assert.equal(download.headers.get('x-content-type-options'),'nosniff');
 const textResponse=await fetch(origin+'/api/media/'+text.id);assert.match(textResponse.headers.get('content-disposition'),/^attachment/);
 for(const [range,expected] of [['bytes=0-3','reso'],['bytes=-7','fixture'],['bytes=9-','fixture']]){const r=await fetch(origin+'/api/media/'+video.id,{headers:{Range:range}});assert.equal(r.status,206);assert.equal(await r.text(),expected);assert.ok(r.headers.get('content-range'));}
 for(const range of ['bytes=100-','bytes=5-2','bytes=-0','bytes=0-1,3-4'])assert.equal((await fetch(origin+'/api/media/'+video.id,{headers:{Range:range}})).status,416);
 assert.equal((await json('/api/media/'+text.id,'PATCH',{filename:'Tên mới.txt',alt:'Mô tả mới'})).status,200);
 assert.equal((await json('/api/media/'+text.id,'PATCH',{filename:'Tên mới.exe',alt:''})).status,400);
 const body=new FormData();body.set('file',new File([png],'edited.png',{type:'image/png'}));
 assert.equal((await fetch(origin+'/api/media/'+text.id,{method:'PUT',body})).status,400);
 assert.equal((await fetch(origin+'/api/media/'+photo.id,{method:'PUT',body})).status,200);
 assert.equal((await (await fetch(origin+'/api/media')).json()).find(a=>a.id===photo.id).source,'edit');
 assert.equal((await json('/api/folders','POST',{parent:'',title:'Invalid cover',imageId:text.id})).status,400);
 const folderResponse=await json('/api/folders','POST',{parent:'',title:'Test resources',imageId:photo.id});assert.equal(folderResponse.status,200,await folderResponse.clone().text());const folder=await folderResponse.json();
 const docResponse=await json('/api/docs','POST',{folder:folder.path,title:'Resource links',kind:'md'});assert.equal(docResponse.status,200);const doc=await docResponse.json();
 assert.equal((await json('/api/docs/'+doc.id,'PUT',{raw:`# Resource links\n![ảnh](/api/media/${photo.id})\n[Tài liệu](/api/media/${text.id}?download=1)`})).status,200);
 const used=await (await fetch(origin+'/api/media/'+photo.id+'/usage')).json();assert.equal(used.folders.length,1);assert.equal(used.docs.length,1);
 const refs=await (await fetch(origin+'/api/media/referenced')).json();assert.ok(refs.ids.includes(photo.id));assert.ok(refs.ids.includes(text.id));assert.equal(refs.ids.includes(pasted.id),false);
 const textUsage=await (await fetch(origin+'/api/media/'+text.id+'/usage')).json();assert.equal(textUsage.docs.length,1);
 const backup=await fetch(origin+'/api/backup');assert.equal(backup.status,200);const zip=await backup.arrayBuffer();
 await server(restoreRoot,port+1);const restoreForm=new FormData();restoreForm.set('file',new File([zip],'backup.zip',{type:'application/zip'}));
 const restored=await fetch(`http://127.0.0.1:${port+1}/api/backup`,{method:'POST',body:restoreForm});assert.equal(restored.status,200,await restored.clone().text());
 assert.deepEqual(await (await fetch(`http://127.0.0.1:${port+1}/api/media`)).json(),await (await fetch(origin+'/api/media')).json());
 assert.deepEqual(Buffer.from(await (await fetch(`http://127.0.0.1:${port+1}/api/media/${photo.id}`)).arrayBuffer()),png);
 await fetch(origin+'/api/media/'+photo.id,{method:'DELETE'});assert.equal((await (await fetch(origin+'/api/folders')).json())[0].imageId,null);
 assert.equal((await fetch(origin+'/api/media/'+photo.id)).status,404);
 console.log('PASS: formats, MIME, 50 MB boundary, original bytes, rename, download, Range, image replacement, covers, usage, delete and backup round-trip');
 if(process.argv.includes('--serve')){console.log('UI fixture: '+origin+'/media');await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});}
}finally{
 for(const child of children){if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}}
 for(const dir of [root,restoreRoot]){assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}
