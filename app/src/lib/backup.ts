import {createReadStream,createWriteStream,closeSync,mkdirSync,openSync,writeSync} from 'node:fs';
import {mkdir,open,readdir,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {createHash,randomUUID} from 'node:crypto';
import {Zip,ZipPassThrough,Unzip,UnzipInflate,UnzipPassThrough} from 'fflate';
import type {UnzipFile} from 'fflate';
import {ROOT,invalidateLibrary,readDB,withLibraryLock,historyOverLimit} from './store';
import {assertDatabaseShape,assertLimits,assertManifest,classifyEntry,effectiveBackupLimits,tooManyBytes,tooManyFiles,zipTooBig,type BackupLimits,type BackupManifest} from './backup-policy';
import {JOURNAL_PATH,recoverInterruptedImport,writeImportJournal,type ImportJournal} from './import-journal';
import {AppError,isAppError} from './i18n/errors';

const CHUNK=64*1024;
const DIRS=['docs','uploads','history'] as const;

export type ListedFile={rel:string;abs:string;size:number;mtimeMs:number};
export type BackupOptions={limits?:BackupLimits;duringSnapshot?:()=>Promise<void>|void;failAfterCommits?:number;leaveJournal?:boolean;metrics?:boolean;deleteZip?:boolean};

function sample(box:{peak:number}){box.peak=Math.max(box.peak,process.memoryUsage().rss);}

export async function listDataFiles(root:string):Promise<ListedFile[]>{
 const out:ListedFile[]=[];
 const dbPath=path.join(root,'db.json');
 const dbStat=await stat(dbPath);
 out.push({rel:'db.json',abs:dbPath,size:dbStat.size,mtimeMs:dbStat.mtimeMs});
 for(const name of DIRS)await walk(path.join(root,name),name,out);
 out.sort((a,b)=>a.rel.localeCompare(b.rel));
 return out;
}

async function walk(dir:string,prefix:string,out:ListedFile[]){
 let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
 for(const item of entries){
  if(item.isSymbolicLink()||item.name.startsWith('.'))continue;
  const rel=prefix+'/'+item.name,abs=path.join(dir,item.name);
  if(item.isDirectory())await walk(abs,rel,out);
  else if(item.isFile()){
   if(classifyEntry(rel)!=='data')throw new AppError('errors.backup.unsafePath',400,{rel});
   const info=await stat(abs);
   out.push({rel,abs,size:info.size,mtimeMs:info.mtimeMs});
  }
 }
}

async function activeLimits(override?:BackupLimits){return override??effectiveBackupLimits((await readDB()).settings);}

export async function inspectBackup(){
 const limits=await activeLimits();
 const files=await listDataFiles(ROOT);
 const uncompressedBytes=files.reduce((sum,file)=>sum+file.size,0);
 const blockers:string[]=[];
 if(files.length>limits.maxDataFiles)blockers.push(tooManyFiles(files.length,limits.maxDataFiles).message);
 if(uncompressedBytes>limits.maxUncompressedBytes)blockers.push(tooManyBytes(uncompressedBytes,limits.maxUncompressedBytes).message);
 return {ok:blockers.length===0,files:files.length,uncompressedBytes,limits,blockers};
}

async function copySnapshot(files:ListedFile[],snap:string,limits:BackupLimits,box:{peak:number}){
 let bytes=0;const hashes=new Map<string,string>();
 assertLimits(files.length,files.reduce((sum,file)=>sum+file.size,0),limits);
 for(const file of files){
  sample(box);
  const now=await stat(file.abs);
  if(now.size!==file.size||now.mtimeMs!==file.mtimeMs)throw new AppError('errors.backup.changedDuringExport');
  bytes+=now.size;
  if(files.length>limits.maxDataFiles)throw tooManyFiles(files.length,limits.maxDataFiles);
  if(bytes>limits.maxUncompressedBytes)throw tooManyBytes(bytes,limits.maxUncompressedBytes);
  const dest=path.join(snap,...file.rel.split('/'));
  await mkdir(path.dirname(dest),{recursive:true});
  const hash=createHash('sha256');
  const src=await open(file.abs,'r'),out=await open(dest,'w');
  try{
   const buf=Buffer.alloc(CHUNK);let pos=0,read=0;
   while(true){
    const {bytesRead}=await src.read(buf,0,buf.length,pos);
    if(!bytesRead)break;
    const slice=Buffer.from(buf.subarray(0,bytesRead));
    hash.update(slice);await out.write(slice);pos+=bytesRead;read+=bytesRead;sample(box);
   }
   if(read!==file.size)throw new AppError('errors.backup.changedDuringExport');
  }finally{await src.close();await out.close();}
  hashes.set(file.rel,hash.digest('hex'));
 }
 return hashes;
}

async function writeZip(files:{name:string;abs:string}[],dest:string,box:{peak:number}){
 const out=createWriteStream(dest);
 let zipError:Error|null=null;
 const zip=new Zip((err,data,final)=>{
  if(err){zipError=err instanceof Error?err:Error(String(err));return;}
  if(data?.length)out.write(Buffer.from(data));
  if(final)out.end();
 });
 const finished=new Promise<void>((resolve,reject)=>{out.on('finish',()=>resolve());out.on('error',reject);});
 for(const file of files){
  if(zipError)throw zipError;
  const entry=new ZipPassThrough(file.name);
  zip.add(entry);
  const handle=await open(file.abs,'r');
  try{
   const buf=Buffer.alloc(CHUNK);let pos=0;
   while(true){
    const {bytesRead}=await handle.read(buf,0,buf.length,pos);
    if(!bytesRead){entry.push(new Uint8Array(),true);break;}
    const chunk=new Uint8Array(bytesRead);chunk.set(buf.subarray(0,bytesRead));
    entry.push(chunk,false);pos+=bytesRead;sample(box);
    if(out.writableNeedDrain)await once(out,'drain');
   }
  }finally{await handle.close();}
 }
 zip.end();
 if(zipError)throw zipError;
 await finished;
}

function sameListing(a:ListedFile[],b:ListedFile[]){
 if(a.length!==b.length)return false;
 for(let i=0;i<a.length;i++)if(a[i].rel!==b[i].rel||a[i].size!==b[i].size||a[i].mtimeMs!==b[i].mtimeMs)return false;
 return true;
}

export async function exportZip(options:BackupOptions={}){
 const limits=await activeLimits(options.limits);
 const box={peak:process.memoryUsage().rss};
 const snap=await mkdirTemp('atlas-snapshot-');
 const zipPath=path.join(os.tmpdir(),`atlas-backup-${randomUUID()}.zip`);
 const cleanup=async()=>{await rm(zipPath,{force:true});await rm(snap,{recursive:true,force:true});};
 try{
  const listed=await withLibraryLock(async()=>{
   const files=await listDataFiles(ROOT);
   const uncompressed=files.reduce((sum,file)=>sum+file.size,0);
   assertLimits(files.length,uncompressed,limits);
   if(options.duringSnapshot)await options.duringSnapshot();
   const hashes=await copySnapshot(files,snap,limits,box);
   const again=await listDataFiles(ROOT);
   if(!sameListing(files,again))throw new AppError('errors.backup.changedDuringExport');
   const manifest:BackupManifest={format:'atlas-docs',version:1,createdAt:new Date().toISOString(),files:Object.fromEntries(hashes)};
   await writeFile(path.join(snap,'atlas-manifest.json'),JSON.stringify(manifest));
   return {files,uncompressed};
  });
  const packed=[...listed.files.map(file=>({name:file.rel,abs:path.join(snap,...file.rel.split('/'))})),{name:'atlas-manifest.json',abs:path.join(snap,'atlas-manifest.json')}];
  await writeZip(packed,zipPath,box);
  const zipStat=await stat(zipPath);
  if(zipStat.size>limits.maxZipBytes)throw zipTooBig(zipStat.size,limits.maxZipBytes);
  await rm(snap,{recursive:true,force:true});
  return {file:zipPath,bytes:zipStat.size,files:listed.files.length,uncompressedBytes:listed.uncompressed,cleanup:async()=>{await rm(zipPath,{force:true});},...(options.metrics?{peakRss:box.peak}:{})};
 }catch(e){await cleanup();throw e;}
}

function inside(root:string,rel:string){
 const dest=path.resolve(root,...rel.split('/'));
 const diff=path.relative(path.resolve(root),dest);
 if(diff.startsWith('..')||path.isAbsolute(diff))throw new AppError('errors.backup.escapeDest',400,{rel});
 return dest;
}

async function extractZip(zipPath:string,stage:string,limits:BackupLimits,box:{peak:number}){
 const hashes=new Map<string,string>();
 let uncompressed=0,count=0,manifestPath='',unfinished=0;
 let fatal:Error|null=null;
 const stop=(error:Error)=>{if(!fatal)fatal=error;};
 const unzipper=new Unzip();
 unzipper.register(UnzipInflate);unzipper.register(UnzipPassThrough);
 unzipper.onfile=(file:UnzipFile)=>{
  const kind=classifyEntry(file.name);
  if(kind==='invalid'){stop(new AppError('errors.backup.unsafePath',400,{rel:file.name}));file.ondata=()=>{};try{file.start();}catch(e){stop(e as Error);}return;}
  let fd=-1;const hash=createHash('sha256');
  unfinished++;
  if(kind!=='directory'){const dest=inside(stage,file.name);mkdirSync(path.dirname(dest),{recursive:true});fd=openSync(dest,'w');}
  file.ondata=(err,data,final)=>{
   if(fatal)return;
   if(err){stop(err instanceof Error?err:Error(String(err)));return;}
   try{
    if(data?.length&&kind!=='directory'){
     uncompressed+=data.length;sample(box);
     if(uncompressed>limits.maxUncompressedBytes)throw tooManyBytes(uncompressed,limits.maxUncompressedBytes);
     hash.update(data);writeSync(fd,data);
    }
    if(final){
     unfinished--;
     if(fd>=0){closeSync(fd);fd=-1;}
     if(kind==='directory')return;
     if(kind==='manifest'){manifestPath=inside(stage,file.name);return;}
     if(hashes.has(file.name))throw new AppError('errors.backup.duplicateName',400,{name:file.name});
     count++;
     if(count>limits.maxDataFiles)throw tooManyFiles(count,limits.maxDataFiles);
     hashes.set(file.name,hash.digest('hex'));
    }
   }catch(e){if(fd>=0){try{closeSync(fd);}catch{}fd=-1;}stop(e as Error);}
  };
  try{file.start();}catch(e){if(fd>=0){try{closeSync(fd);}catch{}fd=-1;}stop(e as Error);}
 };
 const input=createReadStream(zipPath,{highWaterMark:CHUNK});
 try{
  for await(const chunk of input){
   unzipper.push(new Uint8Array(chunk as Buffer));
   sample(box);
   if(fatal)throw fatal;
  }
  unzipper.push(new Uint8Array(),true);
  if(fatal)throw fatal;
 }catch(e){
  input.destroy();
  if(fatal)throw fatal;
  if(isAppError(e))throw e;
  throw new AppError('errors.backup.zipCorrupt');
 }
 if(fatal)throw fatal;
 if(unfinished)throw new AppError('errors.backup.zipCorrupt');
 if(!manifestPath)throw new AppError('errors.backup.notAtlas');
 const manifestStat=await stat(manifestPath);
 if(manifestStat.size>8*1024*1024)throw new AppError('errors.backup.manifestTooBig');
 const manifest=JSON.parse(await readFile(manifestPath,'utf8')) as unknown;
 assertManifest(manifest,hashes);
 const dbPath=path.join(stage,'db.json');
 assertDatabaseShape(JSON.parse(await readFile(dbPath,'utf8')));
 return {files:count,uncompressed};
}

async function libraryEmpty(){
 const db=await readDB();
 if(db.comments.length||db.assets.length||db.folders.length)return false;
 for(const name of DIRS){
  try{if((await readdir(path.join(ROOT,name))).length)return false;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 }
 return true;
}

async function commitStage(stage:string,zipPath:string|null,options:BackupOptions){
 const journal:ImportJournal={status:'preparing',stage,zip:zipPath,previousDb:null,removed:[],committed:[]};
 await writeImportJournal(journal);
 const previous=path.join(ROOT,'.db.json.import-previous');
 await rename(path.join(ROOT,'db.json'),previous);
 journal.previousDb=previous;await writeImportJournal(journal);
 let commits=0;
 const bump=async()=>{commits++;if(options.failAfterCommits===commits)throw Error('interrupted');};
 for(const name of DIRS){
  const src=path.join(stage,name);
  try{await stat(src);}catch{continue;}
  const dest=path.join(ROOT,name);
  await rm(dest,{recursive:true,force:true});
  journal.removed.push(dest);await writeImportJournal(journal);
  await rename(src,dest);
  journal.committed.push(dest);await writeImportJournal(journal);
  await bump();
 }
 await rename(path.join(stage,'db.json'),path.join(ROOT,'db.json'));
 journal.committed.push(path.join(ROOT,'db.json'));await writeImportJournal(journal);
 await bump();
 journal.status='committed';journal.committed=[];journal.removed=[];
 await writeImportJournal(journal);
 await rm(previous,{force:true});
 await rm(stage,{recursive:true,force:true});
 if(zipPath&&options.deleteZip!==false)await rm(zipPath,{force:true});
 await rm(JOURNAL_PATH,{force:true});
 invalidateLibrary();
}

export async function importZip(zipPath:string,options:BackupOptions={}){
 const limits=await activeLimits(options.limits);
 const box={peak:process.memoryUsage().rss};
 await recoverInterruptedImport();
 const zipStat=await stat(zipPath);
 if(zipStat.size>limits.maxZipBytes)throw zipTooBig(zipStat.size,limits.maxZipBytes);
 if(!await libraryEmpty())throw new AppError('errors.backup.importEmptyOnly');
 const stage=await mkdirTemp('atlas-import-');
 try{
  const extracted=await extractZip(zipPath,stage,limits,box);
  await withLibraryLock(async()=>{
   if(!await libraryEmpty())throw new AppError('errors.backup.importEmptyOnly');
   await commitStage(stage,options.deleteZip===false?null:zipPath,options);
  });
  const historyOver=await historyOverLimit();
  return {ok:true as const,files:extracted.files,uncompressedBytes:extracted.uncompressed,historyOver:historyOver.docs,...(options.metrics?{peakRss:box.peak}:{})};
 }catch(e){
  if(!options.leaveJournal)await recoverInterruptedImport();
  await rm(stage,{recursive:true,force:true}).catch(()=>{});
  throw e;
 }
}

export async function receiveZip(body:ReadableStream<Uint8Array>|null,limits?:BackupLimits){
 const cap=await activeLimits(limits);
 if(!body)throw new AppError('errors.backup.zipRequired');
 const file=path.join(os.tmpdir(),`atlas-zip-${randomUUID()}.zip`);
 const out=createWriteStream(file);
 const reader=body.getReader();
 let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>cap.maxZipBytes)throw zipTooBig(total,cap.maxZipBytes);
   if(!out.write(Buffer.from(value)))await once(out,'drain');
  }
  await new Promise<void>((resolve,reject)=>{out.on('error',reject);out.end(()=>resolve());});
 }catch(e){
  try{reader.releaseLock();}catch{}
  out.destroy();
  await rm(file,{force:true});
  throw e;
 }
 return {file,bytes:total};
}

async function mkdirTemp(prefix:string){const dir=path.join(os.tmpdir(),prefix+randomUUID());await mkdir(dir,{recursive:true});return dir;}
