import {lstat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {ROOT,REV_FILE,readDB} from './store';
import {effectiveBackupLimits,formatBytes,type BackupLimits} from './backup-policy';

export type StorageGroup={bytes:number;files:number};
export type StorageWarning={level:'warn'|'block';key:string;params:Record<string,string|number>};
export type StorageStats={
 scannedAt:string;totalBytes:number;totalFiles:number;backupBytes:number;backupFiles:number;complete:boolean;
 documents:StorageGroup;history:StorageGroup;historyMeta:StorageGroup;observed:StorageGroup;attachments:StorageGroup;database:StorageGroup;
 unusual:{path:string;bytes:number;kind:string}[];
 errors:{path:string;message:string}[];
 limits:BackupLimits;zipEstimateBytes:number;warnings:StorageWarning[];
};

const cache:{at:number;value:StorageStats|null}={at:0,value:null};
const READS=8;

function empty():StorageGroup{return {bytes:0,files:0};}
function add(group:StorageGroup,bytes:number){group.bytes+=bytes;group.files++;}

async function pool<T>(items:T[],fn:(item:T)=>Promise<void>){
 let index=0;
 async function worker(){while(index<items.length){const current=items[index++];await fn(current);}}
 await Promise.all(Array.from({length:Math.min(READS,items.length)},()=>worker()));
}

function relOf(abs:string){return path.relative(ROOT,abs).split(path.sep).join('/');}

export function invalidateStorageStats(){cache.value=null;}

export async function storageStats(refresh=false){
 if(!refresh&&cache.value&&Date.now()-cache.at<15_000)return cache.value;
 const value=await scan();
 cache.at=Date.now();cache.value=value;
 return value;
}

async function scan():Promise<StorageStats>{
 const limits=effectiveBackupLimits((await readDB()).settings);
 const stats:StorageStats={
  scannedAt:new Date().toISOString(),totalBytes:0,totalFiles:0,backupBytes:0,backupFiles:0,complete:true,
  documents:empty(),history:empty(),historyMeta:empty(),observed:empty(),attachments:empty(),database:empty(),
  unusual:[],errors:[],limits,zipEstimateBytes:0,warnings:[],
 };
 const files:string[]=[];
 async function walk(dir:string){
  let entries;
  try{entries=await readdir(dir,{withFileTypes:true});}catch(e){stats.complete=false;stats.errors.push({path:relOf(dir)||'.',message:(e as Error).message});return;}
  for(const entry of entries){
   const abs=path.join(dir,entry.name);
   if(entry.isSymbolicLink()){stats.unusual.push({path:relOf(abs),bytes:0,kind:'symlink'});continue;}
   if(entry.isDirectory())await walk(abs);
   else if(entry.isFile())files.push(abs);
   else stats.unusual.push({path:relOf(abs),bytes:0,kind:'other'});
  }
 }
 await walk(ROOT);
 await pool(files,async abs=>{
  let info;try{info=await lstat(abs);}catch(e){stats.complete=false;stats.errors.push({path:relOf(abs),message:(e as Error).message});return;}
  if(info.isSymbolicLink()){stats.unusual.push({path:relOf(abs),bytes:info.size,kind:'symlink'});return;}
  const rel=relOf(abs),bytes=info.size,base=path.posix.basename(rel);
  const temp=/\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i.test(base);
  let backup=true;
  if(temp){stats.unusual.push({path:rel,bytes,kind:'temp'});backup=false;}
  else if(rel==='db.json')add(stats.database,bytes);
  else if(rel.startsWith('docs/')&&!rel.split('/').some(part=>part.startsWith('.')))add(stats.documents,bytes);
  else if(rel.startsWith('history/observed/'))add(stats.observed,bytes);
  else if(rel.startsWith('history/')&&REV_FILE.test(base))add(stats.history,bytes);
  else if(rel.startsWith('history/')&&rel.endsWith('.json')&&REV_FILE.test(base.replace(/\.json$/i,'.md')))add(stats.historyMeta,bytes);
  else if(rel.startsWith('uploads/')&&!base.startsWith('.'))add(stats.attachments,bytes);
  else{stats.unusual.push({path:rel,bytes,kind:rel.split('/').some(part=>part.startsWith('.'))?'hidden':'other'});backup=false;}
  stats.totalBytes+=bytes;stats.totalFiles++;
  if(backup){stats.backupBytes+=bytes;stats.backupFiles++;}
 });
 stats.zipEstimateBytes=stats.backupBytes+stats.backupFiles*128;
 const warn=(used:number,limit:number,labelKey:string,bytes:boolean)=>{
  const usedLabel=bytes?formatBytes(used):used;
  const limitLabel=bytes?formatBytes(limit):limit;
  if(used>limit)stats.warnings.push({level:'block',key:'storage.warning.backupBlock',params:{label:labelKey,used:usedLabel,limit:limitLabel}});
  else if(limit>0&&used>=limit*0.8)stats.warnings.push({level:'warn',key:'storage.warning.backupPercent',params:{label:labelKey,percent:Math.floor(used/limit*100)}});
 };
 warn(stats.backupBytes,limits.maxUncompressedBytes,'storage.limit.data',true);
 warn(stats.backupFiles,limits.maxDataFiles,'storage.limit.files',false);
 warn(stats.zipEstimateBytes,limits.maxZipBytes,'storage.limit.zipEstimate',true);
 return stats;
}
