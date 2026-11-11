import {readFile} from 'node:fs/promises';
import {appRuntime} from './app-runtime';
import {loadCore} from './load-core';

export async function updateStatus(force = false) {
 const runtime = appRuntime();
 let operation = null;
 if (runtime.stateFile) {
  try { operation = JSON.parse(await readFile(runtime.stateFile, 'utf8')); } catch {}
 }
 if (runtime.development) return {currentVersion:runtime.version,development:true,updateAvailable:false,canAutoUpdate:false,status:'development',operation};
 const core = await loadCore();
 const result = await core.checkForUpdate(runtime.packageRoot,runtime.version,{force});
 const install = result.install;
 const advice = core.updateAdvice(install,result.latestVersion,'atlas-docs');
 const canAutoUpdate = !!(runtime.managed && install?.method === 'npm-global' && install.globalPrefix && core.nodeSatisfies(result.nodeRequirement));
 return {
  currentVersion:runtime.version, development:false, latestVersion:result.latestVersion || null,
  updateAvailable:!!result.updateAvailable, canAutoUpdate, method:install?.method || 'unknown',
  status:result.skipped ? (result.reason === 'disabled' ? 'disabled' : 'unavailable') : result.updateAvailable ? 'available' : 'current',
  command:advice.command, guide:install?.method === 'docker' ? '/help/operations#docker-hub-image-end-users' : install?.method === 'source' ? '/help/operations#update-an-installation' : '/help/npm#updates',
  nodeRequirement:result.nodeRequirement || null, operation,
 };
}

export function requestManagedUpdate() {
 return new Promise<{id:string}>((resolve,reject) => {
  if (!process.send || !process.connected) return reject(Error('CLI supervisor is unavailable'));
  const id = crypto.randomUUID();
  const timer = setTimeout(() => {cleanup();reject(Error('Update supervisor did not respond'));},10000);
  const cleanup = () => {clearTimeout(timer);process.off('message',receive);};
  const receive = (message:unknown) => {
   const value = message as {type?:string;requestId?:string;id:string;error?:string};
   if (value?.type !== 'atlas:update-ack' || value.requestId !== id) return;
   cleanup();
   if (value.error) reject(Error(value.error)); else resolve({id:value.id});
  };
  process.on('message',receive);
  process.send({type:'atlas:update',requestId:id},error=>{if(error){cleanup();reject(error);}});
 });
}
