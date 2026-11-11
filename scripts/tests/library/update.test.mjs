import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {checkForUpdate,fetchLatestVersion} from '../../../app/src/library/update/check.mjs';
import {detectInstallMethod} from '../../../app/src/library/update/detect.mjs';
import {nodeSatisfies,stableVersion,npmOutput} from '../../../app/src/library/update/npm.mjs';
import {prepareManagedUpdate,installManagedUpdate,markUpdateReady,writeUpdateState} from '../../../app/src/cli/managed-update.mjs';

test('progress survives a temporary Windows sharing violation',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'atlas-status-sharing-')),file=path.join(root,'state.json');
 try{
  await writeUpdateState(file,{phase:'restarting'});let attempts=0;
  await writeUpdateState(file,{phase:'succeeded'},{replace:async(from,to)=>{if(++attempts<3)throw Object.assign(Error('Temporary file sharing violation'),{code:'EPERM'});await rename(from,to);}});
  assert.equal(attempts,3);assert.equal(JSON.parse(await readFile(file)).phase,'succeeded');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('source working directory and Docker have the right install method',async()=>{
 assert.equal((await detectInstallMethod(path.resolve('app'),{})).method,'source');
 assert.equal((await detectInstallMethod(path.resolve('.'),{})).packageName,'atlas-docs');
 const root=await mkdtemp(path.join(tmpdir(),'atlas-detect-'));
 try{
  await writeFile(path.join(root,'package.json'),JSON.stringify({name:'atlas-docs',version:'5.3.0'}));
  assert.equal((await detectInstallMethod(root,{ATLAS_DOCS_INSTALL:'docker'})).method,'docker');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('npm runner executes on Windows and POSIX without a shell',()=>{
 assert.match(npmOutput(['--version']),/^\d+\.\d+\.\d+$/);
 assert.equal(stableVersion('5.3.1; rm -rf /'),false);
 assert.equal(stableVersion('5.3.1-beta.1'),false);
 assert.equal(nodeSatisfies('>=22.12.0','22.11.0'),false);
 assert.equal(nodeSatisfies('>=22.12.0','22.12.0'),true);
 assert.equal(nodeSatisfies('>=22.12.0','24.0.0'),true);
 assert.equal(nodeSatisfies('unsupported requirement','24.0.0'),false);
});

test('update check separates offline, disabled, cached and equal/newer versions',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'atlas-check-')),cachePath=path.join(root,'cache.json');
 const original=globalThis.fetch;
 try{
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({version:'5.3.0',engines:{node:'>=22.12.0'}});};
  const options={env:{},cachePath};
  assert.equal((await checkForUpdate(path.resolve('app'),'5.3.0',options)).updateAvailable,false);
  assert.equal((await checkForUpdate(path.resolve('app'),'5.2.0',options)).updateAvailable,true);
  assert.equal(calls,1,'cache avoids a second registry request');
  assert.equal((await checkForUpdate(path.resolve('app'),'5.4.0',options)).updateAvailable,false);
  await checkForUpdate(path.resolve('app'),'5.3.0',{...options,force:true});
  assert.equal(calls,2,'manual refresh bypasses cache');
  const disabled=await checkForUpdate(path.resolve('app'),'5.2.0',{...options,force:true,env:{ATLAS_DOCS_NO_UPDATE_CHECK:'1'}});
  assert.equal(disabled.reason,'disabled');assert.equal(calls,2);
  globalThis.fetch=async()=>{throw Error('offline');};
  assert.equal((await checkForUpdate(path.resolve('app'),'5.3.0',{...options,force:true})).reason,'network');
  assert.equal((await checkForUpdate(path.resolve('app'),'',options)).reason,'version');
  globalThis.fetch=async()=>Response.json({version:'5.4.0;bad'});
  await assert.rejects(()=>fetchLatestVersion(),/invalid stable version/);
 }finally{globalThis.fetch=original;await rm(root,{recursive:true,force:true});}
});

test('managed update preflight refuses unsupported installs, offline and incompatible Node before stopping',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'atlas-preflight-')),state=path.join(root,'state.json');
 const base={latestVersion:'5.3.1',updateAvailable:true,install:{method:'npm-global',packageName:'atlas-docs',globalPrefix:root}};
 try{
  for(const result of [{...base,skipped:true},{...base,nodeRequirement:'>=999.0.0'},{...base,latestVersion:'bad'},{...base,install:{method:'source'}}]){
   await assert.rejects(()=>prepareManagedUpdate(root,'5.3.0',state,{check:async()=>result}));
   await assert.rejects(()=>readFile(state));
  }
  const job=await prepareManagedUpdate(root,'5.3.0',state,{check:async()=>base});
  assert.equal(job.targetVersion,'5.3.1');assert.equal(JSON.parse(await readFile(state)).phase,'stopping');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('installer pins the same npm prefix, verifies version, reports failure and does not touch library bytes',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'atlas-installer-')),state=path.join(root,'state.json'),library=path.join(root,'library');
 const job={id:'test',currentVersion:'5.3.0',targetVersion:'5.3.1',prefix:path.join(root,'npm prefix')};
 try{
  await mkdir(library);await writeFile(path.join(library,'document.md'),'keep me');
  let args;
  assert.equal(await installManagedUpdate(root,job,state,{runNpm:async a=>{args=a;},readManifest:async()=>({version:'5.3.1'})}),true);
  assert.deepEqual(args,['install','-g','--prefix',job.prefix,'atlas-docs@5.3.1']);
  await markUpdateReady(state,'5.3.1');assert.equal(JSON.parse(await readFile(state)).phase,'succeeded');
  const fail=async()=>{throw Error('EACCES permission denied');};
  assert.equal(await installManagedUpdate(root,job,state,{runNpm:fail,readManifest:async()=>({version:'5.3.0'})}),'recover');
  const error=JSON.parse(await readFile(state));assert.equal(error.phase,'error');assert.equal(error.failedPhase,'installing');assert.match(error.recoveryCommand,/5\.3\.0/);
  assert.equal(await installManagedUpdate(root,job,state,{runNpm:fail,readManifest:async()=>({version:'5.3.1'})}),false,'a partly replaced package cannot be treated as the old version');
  assert.equal(await installManagedUpdate(root,job,state,{runNpm:async()=>{},readManifest:async()=>({version:'0.0.1'})}),false);
  assert.equal(await readFile(path.join(library,'document.md'),'utf8'),'keep me');
 }finally{await rm(root,{recursive:true,force:true});}
});
