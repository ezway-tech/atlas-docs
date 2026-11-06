import {lstat,readdir,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,docsRoot,historyRoot,uploadsRoot,REV_FILE,listActiveTemps,readDB,readLibrary,writeDB,withLibraryLock,invalidateLibrary} from './store';
import {invalidateStorageStats} from './storage-stats';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEMP=/\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i;
const READS=8;

export type MediaUsage={folders:{path:string;title:string}[];docs:{id:string;title:string}[];comments:{id:string;docId:string}[];history:{docId:string;version:string}[];uncertain:boolean};
export type CleanupCandidate={id:string;kind:'asset'|'temp';group:'history'|'unreferenced'|'temp';size:number;mtimeMs:number;reason:string;filename?:string;recent?:boolean};
export type CleanupReport={scannedAt:string;uncertain:boolean;candidates:CleanupCandidate[];orphans:{name:string;bytes:number}[];missing:{id:string;filename:string}[]};

type Found={current:Set<string>;history:Map<string,{docId:string;version:string}[]>;uncertain:boolean};

function note(text:string,found:Found,onId:(id:string)=>void){
 const rx=/\/api\/media\/([^)\s"'<>]*)/g;let match:RegExpExecArray|null;
 while((match=rx.exec(text))){
  const token=decodeURIComponent(match[1].split('?')[0].split('#')[0]);
  if(UUID.test(token))onId(token.toLowerCase());
  else found.uncertain=true;
 }
}

async function pool<T>(items:T[],fn:(item:T)=>Promise<void>){
 let index=0;async function worker(){while(index<items.length)await fn(items[index++]);}
 await Promise.all(Array.from({length:Math.min(READS,items.length)},()=>worker()));
}

async function historyFiles(){
 const out:{abs:string;docId:string;version:string}[]=[];
 async function walk(dir:string,prefix:string){
  let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
  for(const entry of entries){
   if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;
   const abs=path.join(dir,entry.name);
   if(entry.isDirectory()){if(!prefix&&entry.name==='observed')continue;await walk(abs,prefix?prefix+'/'+entry.name:entry.name);}
   else if(entry.isFile()&&prefix&&REV_FILE.test(entry.name))out.push({abs,docId:prefix,version:entry.name});
  }
 }
 await walk(historyRoot,'');
 return out;
}

export async function collectReferences():Promise<Found>{
 const found:Found={current:new Set(),history:new Map(),uncertain:false};
 const [lib,db]=await Promise.all([readLibrary(),readDB()]);
 for(const doc of lib.docs)note(doc.raw||doc.content||'',found,id=>found.current.add(id));
 for(const comment of db.comments)note(comment.content||'',found,id=>found.current.add(id));
 for(const folder of db.folders)if(folder.imageId)found.current.add(folder.imageId.toLowerCase());
 let failed=false;
 await pool(await historyFiles(),async file=>{
  try{const text=await readFile(file.abs,'utf8');note(text,found,id=>{const list=found.history.get(id)||[];list.push({docId:file.docId,version:file.version});found.history.set(id,list);});}
  catch{failed=true;}
 });
 if(failed)found.uncertain=true;
 return found;
}

export async function mediaUsage(id:string):Promise<MediaUsage>{
 const key=id.toLowerCase();
 const [found,lib,db]=await Promise.all([collectReferences(),readLibrary(),readDB()]);
 return {
  folders:db.folders.filter(folder=>folder.imageId?.toLowerCase()===key).map(folder=>({path:folder.path,title:folder.title})),
  docs:lib.docs.filter(doc=>(doc.raw||doc.content||'').toLowerCase().includes('/api/media/'+key)).map(doc=>({id:doc.id,title:doc.title})),
  comments:db.comments.filter(comment=>comment.content.toLowerCase().includes('/api/media/'+key)).map(comment=>({id:comment.id,docId:comment.docId})),
  history:found.history.get(key)||[],
  uncertain:found.uncertain,
 };
}

export async function referencedMedia(){
 const found=await collectReferences();
 const ids=new Set([...found.current,...found.history.keys()]);
 return {ids:[...ids],complete:!found.uncertain};
}

let preview:{at:string;rows:Map<string,CleanupCandidate&{storedName?:string;abs?:string}>}|null=null;

export async function scanCleanup():Promise<CleanupReport>{
 const [found,db]=await Promise.all([collectReferences(),readDB()]);
 const rows=new Map<string,CleanupCandidate&{storedName?:string;abs?:string}>();
 const missing:{id:string;filename:string}[]=[];
 const known=new Set<string>();
 const recentCut=Date.now()-24*60*60*1000;
 for(const asset of db.assets){
  const id=asset.id.toLowerCase();
  known.add(asset.storedName);
  const abs=path.join(uploadsRoot,asset.storedName);
  let info;try{info=await lstat(abs);}catch{missing.push({id:asset.id,filename:asset.filename});continue;}
  if(info.isSymbolicLink()){found.uncertain=true;continue;}
  const current=found.current.has(id),history=found.history.has(id);
  if(current)continue;
  if(found.uncertain&&!history)continue;
  const group=history?'history':'unreferenced';
  const reason=group==='history'?'Được dùng trong lịch sử.':'Có trong thư viện nhưng không thấy tham chiếu. Có thể là tệp bạn muốn giữ.';
  rows.set(id,{id:asset.id,kind:'asset',group,size:info.size,mtimeMs:info.mtimeMs,reason,filename:asset.filename,recent:Date.parse(asset.createdAt)>=recentCut,storedName:asset.storedName});
 }
 const orphans:{name:string;bytes:number}[]=[];
 let uploadNames:string[]=[];
 try{uploadNames=await readdir(uploadsRoot);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')found.uncertain=true;}
 for(const name of uploadNames){
  if(name.startsWith('.')||known.has(name))continue;
  const abs=path.join(uploadsRoot,name);
  let info;try{info=await lstat(abs);}catch{found.uncertain=true;continue;}
  if(info.isSymbolicLink()||!info.isFile()){found.uncertain=true;continue;}
  orphans.push({name,bytes:info.size});
 }
 const active=new Set(listActiveTemps().map(item=>path.resolve(item)));
 await walkTemps(docsRoot,async abs=>{
  if(active.has(path.resolve(abs)))return;
  const info=await lstat(abs);
  if(info.isSymbolicLink()||!info.isFile())return;
  const rel=path.relative(docsRoot,abs);
  if(rel.startsWith('..'))return;
  const id='temp:'+createHash('sha256').update(rel).digest('hex').slice(0,16);
  rows.set(id,{id,kind:'temp',group:'temp',size:info.size,mtimeMs:info.mtimeMs,reason:'Tệp tạm của lần lưu đã kết thúc.',abs});
 });
 const at=new Date().toISOString();
 preview={at,rows};
 const candidates=[...rows.values()].map(({storedName:_s,abs:_a,...item})=>item);
 return {scannedAt:at,uncertain:found.uncertain,candidates,orphans,missing};
}

async function walkTemps(dir:string,fn:(abs:string)=>Promise<void>){
 let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch{return;}
 for(const entry of entries){
  if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;
  const abs=path.join(dir,entry.name);
  if(entry.isDirectory())await walkTemps(abs,fn);
  else if(entry.isFile()&&TEMP.test(entry.name))await fn(abs);
 }
}

export async function applyCleanup(scannedAt:string,ids:unknown){
 if(!preview||preview.at!==scannedAt)throw Error('Bản xem trước đã cũ. Hãy quét lại.');
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('Danh sách tệp không hợp lệ.');
 const chosen=ids as string[];
 return withLibraryLock(async()=>{
  const found=await collectReferences();
  const db=await readDB();
  const deleted:string[]=[];
  const skipped:{id:string;reason:string}[]=[];
  const failed:{id:string;error:string}[]=[];
  const planned:{id:string;abs:string;assetId?:string;size:number}[]=[];
  for(const id of chosen){
   const row=id.startsWith('temp:')?preview!.rows.get(id):preview!.rows.get(id.toLowerCase());
   if(!row){failed.push({id,error:'Không có trong bản xem trước.'});continue;}
   if(row.group==='history'){skipped.push({id,reason:'Được dùng trong lịch sử.'});continue;}
   if(row.kind==='temp'){
    if(!row.abs||!TEMP.test(path.basename(row.abs))||path.relative(docsRoot,row.abs).startsWith('..')){failed.push({id,error:'Tệp tạm không còn hợp lệ.'});continue;}
    if(listActiveTemps().some(item=>path.resolve(item)===path.resolve(row.abs!))){skipped.push({id,reason:'Tệp tạm đang được dùng.'});continue;}
    let info;try{info=await lstat(row.abs);}catch{failed.push({id,error:'Tệp không còn.'});continue;}
    if(info.isSymbolicLink()||info.size!==row.size||info.mtimeMs!==row.mtimeMs){skipped.push({id,reason:'Tệp đã đổi.'});continue;}
    planned.push({id,abs:row.abs,size:info.size});continue;
   }
   const asset=db.assets.find(item=>item.id.toLowerCase()===row.id.toLowerCase());
   if(!asset){failed.push({id,error:'Bản ghi không còn.'});continue;}
   const key=asset.id.toLowerCase();
   if(found.current.has(key)||found.history.has(key)||found.uncertain){skipped.push({id,reason:found.history.has(key)&&!found.current.has(key)?'Được dùng trong lịch sử.':'Đang được dùng hoặc chưa đủ thông tin.'});continue;}
   const abs=path.join(uploadsRoot,asset.storedName);
   let info;try{info=await lstat(abs);}catch{failed.push({id,error:'Tệp không còn trên đĩa.'});continue;}
   if(info.isSymbolicLink()||info.size!==row.size||info.mtimeMs!==row.mtimeMs){skipped.push({id,reason:'Tệp đã đổi.'});continue;}
   planned.push({id:asset.id,abs,assetId:asset.id,size:info.size});
  }
  const assetIds=planned.flatMap(item=>item.assetId?[item.assetId]:[]);
  if(assetIds.length){
   const drop=new Set(assetIds);
   await writeDB(data=>{
    data.assets=data.assets.filter(asset=>!drop.has(asset.id));
    let cover=false;
    for(const folder of data.folders)if(folder.imageId&&drop.has(folder.imageId)){folder.imageId=null;cover=true;}
    if(cover)invalidateLibrary();
   });
  }
  let freedBytes=0;
  for(const item of planned){try{await rm(item.abs,{force:true});deleted.push(item.id);freedBytes+=item.size;}catch(e){failed.push({id:item.id,error:(e as Error).message});}}
  invalidateStorageStats();
  preview=null;
  return {deleted,skipped,failed,freedBytes};
 });
}
