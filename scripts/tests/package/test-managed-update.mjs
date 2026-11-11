import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {npmArgs,run} from '../../build/process.mjs';
import {npmCli} from '../../../app/src/library/update/npm.mjs';

// Use actual release runtime and actual npm installs, only substituting registry
// discovery and package resolution so this never publishes or updates user npm.
const repo=process.cwd(),version=JSON.parse(await readFile('app/package.json')).version;
const target=version.split('.').map(Number);target[2]++;const nextVersion=target.join('.');
const tarball=path.join(repo,'dist',`atlas-docs-${version}.tgz`);await access(tarball);
const root=await mkdtemp(path.join(tmpdir(),'atlas-managed-test-')),prefix=path.join(root,'npm prefix'),library=path.join(root,'library'),fixture=path.join(root,'fixture'),wrapper=path.join(root,'npm-cli.js'),preload=path.join(root,'registry.mjs');
const pkg=path.join(prefix,process.platform==='win32'?'node_modules/atlas-docs':'lib/node_modules/atlas-docs');
const cli=path.join(pkg,'bin/atlas-docs.mjs');let server,logs='';
const cleanEnv={...process.env};for(const key of ['DATA_DIR','CI','ATLAS_DOCS_NO_UPDATE_CHECK','ATLAS_APP_VERSION','ATLAS_PACKAGE_ROOT','ATLAS_CORE_PATH','ATLAS_UPDATE_STATE'])delete cleanEnv[key];
const env={...cleanEnv,npm_config_prefix:prefix,ATLAS_DOCS_UPDATE_CACHE:path.join(root,'update-cache.json')};
async function unusedPort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const value=s.address().port;await new Promise(r=>s.close(r));return value;}
const port=await unusedPort(),origin=`http://127.0.0.1:${port}`;
async function start(fail=false){
 logs='';server=spawn(process.execPath,[cli,'--data-dir',library,'--port',String(port),'--no-open'],{cwd:root,env:{...env,npm_execpath:wrapper,NODE_OPTIONS:[env.NODE_OPTIONS||'',`--import=${pathToFileURL(preload).href}`].join(' ').trim(),ATLAS_TEST_INSTALL_FAIL:fail?'1':'0'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 for(let i=0;i<180;i++){if(server.exitCode!==null)throw Error(logs);try{const s=await status();if(s.currentVersion)return s;}catch{}await delay(300);}throw Error('Startup timeout '+logs);
}
async function status(){return (await fetch(origin+'/api/update-status',{signal:AbortSignal.timeout(2000)})).json();}
async function stop(){if(!server||server.exitCode!==null)return;const exited=new Promise(r=>server.once('exit',r));server.send('atlas:stop');let timer;try{await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Shutdown timeout '+logs)),15000);})]);server=null;}finally{clearTimeout(timer);}}
async function waitOperation(phase){for(let i=0;i<180;i++){if(server.exitCode!==null)throw Error(logs);try{const result=await status();if(result.operation?.phase===phase)return result;}catch{}await delay(400);}throw Error('Update timeout '+logs);}
async function request(){return fetch(origin+'/api/update',{method:'POST',headers:{Origin:origin,'X-Atlas-Update':'1'}});}
try{
 await mkdir(prefix);await cp(path.join(repo,'dist/npm'),fixture,{recursive:true});
 const manifest=JSON.parse(await readFile(path.join(fixture,'package.json')));manifest.version=nextVersion;await writeFile(path.join(fixture,'package.json'),JSON.stringify(manifest));
 await run(npmArgs(['pack','--silent','--pack-destination',root]),{cwd:fixture,env});
 const nextTarball=path.join(root,`atlas-docs-${nextVersion}.tgz`);
 await writeFile(wrapper,`const {spawnSync}=require('node:child_process');const args=process.argv.slice(2);if(args[0]==='install'&&args.includes('atlas-docs@${nextVersion}')){if(process.env.ATLAS_TEST_INSTALL_FAIL==='1'){console.error('Simulated EACCES in temporary prefix');process.exit(13);}args[args.indexOf('atlas-docs@${nextVersion}')]=${JSON.stringify(nextTarball)};}const r=spawnSync(process.execPath,[${JSON.stringify(npmCli())},...args],{stdio:'inherit',windowsHide:true});process.exit(r.status??1);`);
 await writeFile(preload,`import os from 'node:os';os.homedir=()=>${JSON.stringify(root)};const original=globalThis.fetch;globalThis.fetch=(url,options)=>String(url).startsWith('https://registry.npmjs.org/atlas-docs/latest')?Promise.resolve(Response.json({version:'${nextVersion}',engines:{node:'>=22.12.0'}})):original(url,options);`);
 await run(npmArgs(['install','-g','--prefix',prefix,'--no-audit','--no-fund',tarball]),{cwd:root,env});
 const before=await start(true);console.log('Initial update status:',JSON.stringify(before));assert.equal(before.method,'npm-global');assert.equal(before.canAutoUpdate,true);assert.equal(before.updateAvailable,true);
 const folder=await (await fetch(origin+'/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parent:'',title:'Keep this folder'})})).json();
 const doc=await (await fetch(origin+'/api/docs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:folder.path,title:'Preserved document',kind:'md'})})).json();
 await fetch(origin+'/api/docs/'+doc.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:'# Keep this content\n\nAcross updates.'})});
 const upload=new FormData();upload.set('file',new Blob(['preserve attachment bytes'],{type:'text/plain'}),'attachment.txt');const asset=await (await fetch(origin+'/api/media',{method:'POST',body:upload})).json();
 const dbBefore=await readFile(path.join(library,'db.json'),'utf8');
 assert.equal((await request()).status,202);const failed=await waitOperation('error');assert.equal(failed.operation.failedPhase,'installing');assert.equal(failed.currentVersion,version);
 assert.equal((await (await fetch(origin+'/api/docs/'+doc.id)).json()).raw,'# Keep this content\n\nAcross updates.');await stop();
 assert.equal(await readFile(path.join(library,'db.json'),'utf8'),dbBefore,'failed package install preserves metadata');
 await start();const accepted=await request();assert.equal(accepted.status,202,await accepted.clone().text());
 const duplicate=await request();assert.notEqual(duplicate.status,202,'duplicate is refused');
 const succeeded=await waitOperation('succeeded');assert.equal(succeeded.currentVersion,nextVersion);assert.equal(succeeded.updateAvailable,false);
 assert.equal((await (await fetch(origin+'/api/docs/'+doc.id)).json()).raw,'# Keep this content\n\nAcross updates.');
 assert.equal(await (await fetch(origin+'/api/media/'+asset.id)).text(),'preserve attachment bytes');
 assert.equal(await readFile(path.join(library,'db.json'),'utf8'),dbBefore,'successful package install preserves metadata');
 await stop();await assert.rejects(()=>fetch(origin+'/api/health'));
 console.log('PASS actual npm global failure/recovery and update/restart; same prefix, port, library bytes and shutdown');
}catch(error){console.error(logs);console.error(error);throw error;}finally{await stop().catch(error=>{console.error(error);server?.kill();});await rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:500});}
