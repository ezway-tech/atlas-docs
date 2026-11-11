import {mkdtemp, readFile, writeFile, rename, access, rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {checkForUpdate} from '../library/update/check.mjs';
import {runNpm, nodeSatisfies, stableVersion} from '../library/update/npm.mjs';

export async function createUpdateState() {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-update-'));
  return path.join(directory, 'state.json');
}

export async function writeUpdateState(file, value, {replace=rename} = {}) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({...value, updatedAt:Date.now()}), {mode:0o600});
    // Windows readers and antivirus scanners can briefly deny replacement.
    for(let attempt=0;;attempt++){
      try {await replace(temporary,file);break;}
      catch(error){if(attempt>=10||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;await delay(50*(attempt+1));}
    }
  }finally{await rm(temporary,{force:true}).catch(()=>{});}
}

export async function prepareManagedUpdate(packageRoot, currentVersion, stateFile, dependencies = {}) {
  const result = await (dependencies.check || checkForUpdate)(packageRoot,currentVersion,{force:true});
  if (result.skipped || !result.updateAvailable || !stableVersion(result.latestVersion)) throw Error('A newer stable version could not be verified. Try checking again.');
  if (result.install?.method !== 'npm-global' || !result.install.globalPrefix || result.install.packageName !== 'atlas-docs') throw Error('Only a verified npm global installation can update automatically.');
  if (!nodeSatisfies(result.nodeRequirement)) throw Error(`Update requires Node.js ${result.nodeRequirement}; this runtime is ${process.versions.node}.`);
  const job = {id:randomUUID(),phase:'stopping',currentVersion,targetVersion:result.latestVersion,prefix:result.install.globalPrefix};
  await writeUpdateState(stateFile,job);
  return job;
}

export async function markUpdateReady(file, version) {
  if (!file) return;
  try {
    const state = JSON.parse(await readFile(file,'utf8'));
    if (state.phase === 'restarting') await writeUpdateState(file,{...state,phase:version === state.targetVersion ? 'succeeded' : 'error',error:version === state.targetVersion ? null : 'Restarted version does not match the requested update.'});
  } catch(error) {if(error.code!=='ENOENT')console.warn(`[Atlas Docs] Could not record update readiness: ${error.message}`);}
}

// All imports are loaded before npm replaces this installation on disk.
export async function installManagedUpdate(packageRoot, job, stateFile, dependencies = {}) {
  const run = dependencies.runNpm || runNpm;
  const verify = dependencies.readManifest || (async () => JSON.parse(await readFile(path.join(packageRoot,'package.json'),'utf8')));
  let phase = 'installing';
  try {
    await writeUpdateState(stateFile,{...job,phase});
    await run(['install','-g','--prefix',job.prefix,`atlas-docs@${job.targetVersion}`],{cwd:path.dirname(stateFile)});
    phase = 'verifying';
    const installed = await verify();
    if (installed.version !== job.targetVersion) throw Error(`npm reports ${installed.version || 'unknown'}; expected ${job.targetVersion}.`);
    if (!dependencies.readManifest) await access(path.join(packageRoot,'runtime/server.js'));
    await writeUpdateState(stateFile,{...job,phase:'restarting'});
    return true;
  } catch (error) {
    const recoveryCommand = `npm install -g --prefix "${job.prefix}" atlas-docs@${job.currentVersion}`;
    await writeUpdateState(stateFile,{...job,phase:'error',failedPhase:phase,error:error.message,recoveryCommand});
    console.error(`[Atlas Docs] Update failed during ${phase}: ${error.message}\n[Atlas Docs] Recovery: ${recoveryCommand}\n[Atlas Docs] Then run: atlas-docs`);
    // Never run a partially replaced installation just because its manifest survived.
    // Verify the old runtime with a health-check launch before treating recovery as successful.
    try { return (await verify()).version === job.currentVersion ? 'recover' : false; } catch { return false; }
  }
}

export async function restartManagedApp(packageRoot, options, stateFile) {
  const args = [path.join(packageRoot,'bin/atlas-docs.mjs'),'--data-dir',options.dataDir,'--port',String(options.port),'--no-open','--yes'];
  const child = spawn(process.execPath,args,{cwd:options.cwd || path.dirname(stateFile),env:{...(options.env || process.env),ATLAS_UPDATE_STATE:stateFile},stdio:['inherit','inherit','inherit','ipc'],windowsHide:true});
  const stop = () => { if (child.connected) child.send('atlas:stop'); else child.kill('SIGTERM'); };
  const message = value => { if (value === 'atlas:stop') stop(); };
  process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('message',message);
  try {
    await new Promise((resolve,reject) => {
      child.once('error',reject);
      child.once('exit',code=>code === 0 ? resolve() : reject(Error(`Restarted CLI exited with code ${code}`)));
    });
  } catch (error) {
    const state = JSON.parse(await readFile(stateFile,'utf8'));
    await writeUpdateState(stateFile,{...state,phase:'error',failedPhase:'restarting',error:error.message});
    console.error(`[Atlas Docs] Restart failed: ${error.message}. Run atlas-docs with the same --data-dir and --port to retry.`);
    throw error;
  } finally {process.off('SIGINT',stop);process.off('SIGTERM',stop);process.off('message',message);}
}
