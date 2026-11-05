import path from 'node:path';
import {mkdir,readFile,readdir,writeFile,rename,stat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {JSONFilePreset} from 'lowdb/node';
import matter from 'gray-matter';
import {extractHeadings} from './headings';
import type {AssetSource,DB,DocInfo,DocKind,Folder,Settings} from './types';
import {folderIconId} from './folder-icons';
import {cleanKeymap} from './keymap';
import {HttpError} from './http';
export const ROOT=path.resolve(process.env.DATA_DIR||path.join(process.cwd(),'..','data'));
export const docsRoot=path.join(ROOT,'docs');
export const uploadsRoot=path.join(ROOT,'uploads');
export const historyRoot=path.join(ROOT,'history');
export const HISTORY_LIMITS={maxCount:50,maxBytes:10*1024*1024} as const;
export type HistoryReason='edit'|'restore';
export const REV_FILE=/^\d{4}-\d{2}-\d{2}T[\w-]+_[0-9a-f-]{36}\.md$/;
export const defaults:Settings={theme:'dark',leftWidth:265,rightWidth:335,pinnedFolders:[],hiddenFolders:[],keymap:{}};
const initial:DB={assets:[],folders:[],comments:[],navigationOrder:{},settings:defaults};
let singleton:ReturnType<typeof JSONFilePreset<DB>>|undefined;let serial:Promise<unknown>=Promise.resolve();
const docLocks=new Map<string,Promise<unknown>>();
function withDocLock<T>(id:string,fn:()=>Promise<T>):Promise<T>{const prev=docLocks.get(id)||Promise.resolve();const next=prev.catch(()=>{}).then(fn);docLocks.set(id,next);return next;}
async function db(){if(!singleton)singleton=(async()=>{await mkdir(ROOT,{recursive:true});return JSONFilePreset<DB>(path.join(ROOT,'db.json'),structuredClone(initial));})();return singleton;}
function assetSource(value:unknown):AssetSource{return value==='paste'||value==='edit'?value:'upload';}
function fill(d:DB){d.assets||=[];for(const asset of d.assets)asset.source=assetSource(asset.source);d.comments||=[];d.folders||=[];d.navigationOrder||={};d.settings={...defaults,...d.settings,keymap:cleanKeymap(d.settings?.keymap)};return d;}
export async function readDB(){await serial.catch(()=>{});const x=await db();await x.read();return structuredClone(fill(x.data));}
export function writeDB<T>(fn:(d:DB)=>T|Promise<T>):Promise<T>{const task=serial.catch(()=>{}).then(async()=>{const x=await db();await x.read();x.data=fill(x.data);const ret=await fn(x.data);await x.write();return ret;});serial=task;return task;}
export function safeFolder(id:string){if(!/^[a-z0-9][a-z0-9_ /-]*$/.test(id)||id.split('/').length>3||id.split('/').some(x=>!x||x==='..'))throw Error('Folder path invalid');return id;}
export function safeDoc(id:string){if(!/^[a-z0-9][a-z0-9_ /-]*(\.(yml|yaml|sql|json))?$/.test(id)||id.split('/').length<2||id.split('/').length>4||id.split('/').some(x=>!x||x==='..'))throw Error('Document path invalid');return id;}
export function docKind(id:string):DocKind{if(/\.ya?ml$/i.test(id))return 'yaml';if(/\.sql$/i.test(id))return 'sql';if(/\.json$/i.test(id))return 'json';return 'md';}
export const folderFile=(f:string)=>path.join(docsRoot,...safeFolder(f).split('/'));
export const docFile=(f:string)=>{const id=safeDoc(f);return path.join(docsRoot,...id.split('/'))+(docKind(id)==='md'?'.md':'');};
export const slug=(title:string)=>title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'untitled';
export function contentHash(raw:string){return createHash('sha256').update(raw,'utf8').digest('hex');}
async function traverse(base:string,prefix='',depth=1,files:string[]=[],folders:string[]=[]){let list;try{list=await readdir(base,{withFileTypes:true});}catch{return {files,folders};}
 for(const e of list){if(e.name.startsWith('.')||e.isSymbolicLink())continue;const key=prefix?prefix+'/'+e.name:e.name;if(e.isDirectory()&&depth<=3&&/^[a-z0-9][a-z0-9_ -]*$/.test(e.name)){folders.push(key);await traverse(path.join(base,e.name),key,depth+1,files,folders);}else if(e.isFile()&&prefix&&/^[a-z0-9][a-z0-9_ -]*\.md$/.test(e.name)){files.push(key.slice(0,-3));}else if(e.isFile()&&prefix&&/^[a-z0-9][a-z0-9_ -]*\.(yml|yaml|sql|json)$/.test(e.name)){files.push(key);}}
 return {files,folders};}
export function strip(raw:string){return matter(raw).content;}
function mapDoc(id:string,raw:string,updatedAt:string):DocInfo{const kind=docKind(id),category=id.split('/').slice(0,-1).join('/');if(kind!=='md'){const file=id.split('/').at(-1)||id;return {id,kind,title:file.replace(/\.(ya?ml|sql|json)$/i,''),description:'',category,order:999,updatedAt,text:raw.slice(0,50000),headings:[],content:raw,raw};}const parsed=matter(raw),body=parsed.content;return {id,kind,title:String(parsed.data.title||id.split('/').at(-1)),description:String(parsed.data.description||''),category,order:Number(parsed.data.order||999),updatedAt,text:body.replace(/[`#>*|_]/g,' ').slice(0,50000),headings:extractHeadings(raw),content:body,raw};}
const mirror=(id:string)=>path.join(historyRoot,'observed',...safeDoc(id).split('/'))+'.md';
const metaFile=(md:string)=>md.replace(/\.md$/i,'.json');
function historyDir(id:string){return path.join(historyRoot,...safeDoc(id).split('/'));}
export async function revision(id:string,raw:string,reason:HistoryReason='edit'){const dir=historyDir(id);await mkdir(dir,{recursive:true});const capturedAt=new Date().toISOString();const name=capturedAt.replace(/[:.]/g,'-')+'_'+crypto.randomUUID()+'.md';const file=path.join(dir,name);await writeFile(file,raw,{flag:'wx'});try{await writeFile(metaFile(file),JSON.stringify({capturedAt,reason}));}catch(e){await rm(file,{force:true});throw e;}return name;}
export async function observe(id:string,raw:string){const location=mirror(id);await mkdir(path.dirname(location),{recursive:true});let old:string|undefined;try{old=await readFile(location,'utf8');}catch{}if(old!==raw)await writeFile(location,raw);}
async function pruneHistory(id:string,protect?:string){const dir=historyDir(id);let names:string[];try{names=await readdir(dir);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}const versions=names.filter(n=>REV_FILE.test(n)).sort().reverse();const sizes=await Promise.all(versions.map(async n=>{try{return(await stat(path.join(dir,n))).size;}catch{return 0;} }));let totalBytes=sizes.reduce((a,b)=>a+b,0),count=versions.length;for(let i=versions.length-1;i>=0&&(count>HISTORY_LIMITS.maxCount||totalBytes>HISTORY_LIMITS.maxBytes);i--){const name=versions[i];if(protect&&name===protect)continue;await rm(path.join(dir,name),{force:true});await rm(metaFile(path.join(dir,name)),{force:true});totalBytes-=sizes[i];count--;}}
type Slot={mtimeMs:number;size:number;doc:DocInfo};
type Catalog={map:Map<string,Slot>;version:number};
let slots=new Map<string,Slot>(),version=0,epoch=0,flight:Promise<Catalog>|null=null,flightEpoch=-1;
let folderEpoch=0,folderFlight:Promise<Folder[]>|null=null,folderFlightEpoch=-1;
export function libraryVersion(){return version;}
export function invalidateLibrary(){slots=new Map();version++;epoch++;folderEpoch++;}
function expireDoc(id:string){slots.delete(id);version++;epoch++;}
function expireFolders(){folderEpoch++;}
async function scanDocs(gen:number){const {files}=await traverse(docsRoot);if(gen!==epoch)return {map:new Map<string,Slot>(),changed:false};const prev=slots,next=new Map<string,Slot>(),flag={changed:files.length!==prev.size};
 await Promise.all(files.map(async id=>{if(gen!==epoch)return;const filename=docFile(id);let info;try{info=await stat(filename);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}if(gen!==epoch)return;const old=prev.get(id);if(old&&old.mtimeMs===info.mtimeMs&&old.size===info.size){next.set(id,old);return;}flag.changed=true;let raw;try{raw=await readFile(filename,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}if(gen!==epoch)return;next.set(id,{mtimeMs:info.mtimeMs,size:info.size,doc:mapDoc(id,raw,info.mtime.toISOString())});}));
 return {map:next,changed:flag.changed};}
function loadCatalog():Promise<Catalog>{if(flight&&flightEpoch===epoch)return flight;const gen=epoch;flightEpoch=gen;const run=scanDocs(gen).then(result=>{if(gen!==epoch)return loadCatalog();slots=result.map;if(result.changed)version++;return {map:slots,version};}).finally(()=>{if(flight===run)flight=null;});flight=run;return run;}
async function loadFolders():Promise<Folder[]>{if(folderFlight&&folderFlightEpoch===folderEpoch)return folderFlight;const gen=folderEpoch;folderFlightEpoch=gen;let run!:Promise<Folder[]>;run=(async():Promise<Folder[]>=>{const [tree,data]=await Promise.all([traverse(docsRoot),readDB()]);if(gen!==folderEpoch)return loadFolders();return tree.folders.map(key=>{const old=data.folders.find(x=>x.path===key);const title=old?.title||key.split('/').at(-1)!.replace(/(^|-)[a-z]/g,x=>x.replace('-','').toUpperCase());return {path:key,title,imageId:old?.imageId||null,icon:folderIconId(old?.icon),depth:key.split('/').length};});})().finally(()=>{if(folderFlight===run)folderFlight=null;});folderFlight=run;return run;}
export async function readLibrary(){const {map,version:rev}=await loadCatalog();return {docs:[...map.values()].map(slot=>slot.doc),version:rev};}
function publish(doc:DocInfo){const {content:_c,raw:_r,...summary}=doc;return summary;}
export async function listDocs(){const {map}=await loadCatalog();return [...map.values()].map(slot=>publish(slot.doc));}
export async function getDoc(id:string){safeDoc(id);const {map}=await loadCatalog();return map.get(id)?.doc??null;}
function starter(kind:DocKind,title:string){if(kind==='yaml')return `openapi: 3.0.3\ninfo:\n  title: ${JSON.stringify(title)}\n  version: "1.0.0"\npaths:\n  /example:\n    get:\n      summary: Ví dụ\n      responses:\n        "200":\n          description: OK\n`;if(kind==='sql'){const table=/^[a-z][a-z0-9_]*$/.test(slug(title).replace(/-/g,'_'))?slug(title).replace(/-/g,'_'):'example';return `CREATE TABLE ${table} (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n);\n`;}if(kind==='json')return `{\n  "name": ${JSON.stringify(title)},\n  "version": "1.0.0"\n}\n`;return `---\ntitle: ${JSON.stringify(title)}\ndescription: ""\n---\n\n# ${title}\n`;}
const kindExt:Record<Exclude<DocKind,'md'>,string>={yaml:'.yml',sql:'.sql',json:'.json'};
export async function createDoc(folder:string,title:string,kind:DocKind='md'){safeFolder(folder);const base=slug(title);const id=folder+'/'+(kind==='md'?base:base+kindExt[kind]);safeDoc(id);const file=docFile(id);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,starter(kind,title),{flag:'wx'});expireDoc(id);return getDoc(id);}
export async function saveDoc(id:string,raw:string,reason:HistoryReason='edit',baseHash?:string){return withDocLock(id,async()=>{if(raw.length>1_500_000)throw Error('Document too large');const old=await getDoc(id);if(!old)throw Error('Document not found');if(baseHash!==undefined&&contentHash(old.raw||'')!==baseHash)throw new HttpError('Document changed',409);if(old.raw===raw)return old;const revName=await revision(id,old.raw||'',reason);const file=docFile(id),tmp=file+'.'+crypto.randomUUID()+'.tmp';try{await writeFile(tmp,raw);await rename(tmp,file);}catch(e){await rm(path.join(historyDir(id),revName),{force:true});await rm(metaFile(path.join(historyDir(id),revName)),{force:true});await rm(tmp,{force:true}).catch(()=>{});throw e;}await observe(id,raw);await pruneHistory(id,reason==='restore'?revName:undefined);expireDoc(id);return getDoc(id);});}
export async function deleteDoc(id:string){safeDoc(id);const file=docFile(id);try{await stat(file);}catch{throw Error('Document not found');}await rm(file,{force:true});await rm(path.join(historyRoot,...id.split('/')),{recursive:true,force:true});await rm(mirror(id),{force:true});await writeDB(d=>{d.comments=d.comments.filter(x=>x.docId!==id);for(const key of Object.keys(d.navigationOrder))d.navigationOrder[key]=d.navigationOrder[key].filter(x=>x!==id);return {ok:true};});expireDoc(id);return {ok:true};}
export async function listFolders(){return loadFolders();}
function cleanIcon(icon:unknown){if(icon==null||icon==='')return null;const id=folderIconId(icon);if(!id)throw Error('Icon không hợp lệ');return id;}
export async function createFolder(parent:string,title:string,imageId:string|null,icon:unknown=null){if(parent)safeFolder(parent);const id=(parent?parent+'/':'')+slug(title);safeFolder(id);const all=await listFolders();if(all.some(f=>f.path===id))throw Error('Folder already exists');const mark=cleanIcon(icon);await mkdir(folderFile(id));await writeDB(x=>{x.folders.push({path:id,title,imageId,icon:mark});});expireFolders();return id;}
export async function updateFolder(id:string,title:string,imageId:string|null,icon:unknown=null){safeFolder(id);await stat(folderFile(id));const mark=cleanIcon(icon);const saved=await writeDB(db=>{let f=db.folders.find(x=>x.path===id);if(!f){f={path:id,title,imageId,icon:mark};db.folders.push(f);}else{f.title=title;f.imageId=imageId;f.icon=mark;}return f;});expireFolders();return saved;}
export async function deleteFolder(id:string){safeFolder(id);const dir=folderFile(id);let names:string[];try{names=await readdir(dir);}catch{throw Error('Folder not found');}if(names.length)throw Error('Folder không trống');await rm(dir,{recursive:true,force:true});await writeDB(d=>{d.folders=d.folders.filter(f=>f.path!==id&&!f.path.startsWith(id+'/'));d.settings.pinnedFolders=d.settings.pinnedFolders.filter(x=>x!==id&&!x.startsWith(id+'/'));d.settings.hiddenFolders=d.settings.hiddenFolders.filter(x=>x!==id&&!x.startsWith(id+'/'));for(const key of Object.keys(d.navigationOrder)){if(key===`docs:${id}`||key===`folders:${id}`||key.startsWith(`docs:${id}/`)||key.startsWith(`folders:${id}/`))delete d.navigationOrder[key];else d.navigationOrder[key]=d.navigationOrder[key].filter(x=>x!==id&&!x.startsWith(id+'/'));}return {ok:true};});expireFolders();return {ok:true};}
export function sorted<T extends {id?:string;path?:string;title:string;order?:number}>(items:T[],prefs:string[]=[]){const priority=new Map(prefs.map((v,i)=>[v,i]));return [...items].sort((a,b)=>(priority.get(a.path||a.id||'')??1e9)-(priority.get(b.path||b.id||'')??1e9)||(a.order??999)-(b.order??999)||a.title.localeCompare(b.title,'vi'));}
