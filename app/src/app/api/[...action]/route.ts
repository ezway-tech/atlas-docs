import {folderWorkspaceRequest} from '@/lib/folder-workspace-api';
import {loadCore} from '@/lib/load-core';
import {ensureLibraryPrepared} from '@/lib/runtime-prepare';
import {validateAsset,assetKind,assetExtension} from '@/lib/assets';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {mkdir,readFile,writeFile,stat,rm,open} from 'node:fs/promises';
import path from 'node:path';
import {NextRequest} from 'next/server';
import {uploadsRoot,createFolder,createDoc,deleteDoc,deleteFolder,getDoc,listDocs,listFolders,readDB,writeDB,saveDoc,updateFolder,safeDoc,safeFolder,invalidateLibrary,withLibraryLock,historyOverLimit,normalizeSidebarSectionOrder} from '@/lib/store';
import type {AssetSource} from '@/lib/types';
import {history,historyDetail,revisionRaw,restore,reorder,links} from '@/lib/extras';
import {exportZip,importZip,inspectBackup,receiveZip} from '@/lib/backup';
import {parseBackupLimits} from '@/lib/backup-policy';
import {parseHistoryLimits} from '@/lib/history-policy';
import {storageStats} from '@/lib/storage-stats';
import {applyCleanup,mediaUsage,referencedMedia,scanCleanup} from '@/lib/asset-references';
import {sanitizeKeymap} from '@/lib/keymap';
import {AppError,err} from '@/lib/http';
import {localeFromRequest} from '@/lib/i18n/request-locale';
import {updateStatus,requestManagedUpdate} from '@/lib/update-status';
import {handleLibraryApi} from '@/lib/library-api';
import {assertLocalAppRequest,runtimeHeaderMismatch,runtimeSessionMismatch} from '@/lib/local-request';
import {isManagerMode} from '@/lib/library-capabilities';
import '@/lib/shutdown-hook';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Params={params:Promise<{action:string[]}>};
let updatePending=false;
const json=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const parts=async(c:Params)=>(await c.params).action;
const DATA_ACTIONS=new Set(['folder-image','folder-files','docs','folders','settings','order','comments','history','links','dashboard','media','storage','backup']);
/** GET /api/media/{uuid} bytes — browser img/video use rt/lib query instead of custom headers. */
function isMediaBytesGet(name:string,method:string,seg:string[]){
  if(name==='folder-image'&&method==='GET')return true;
  return name==='media'&&method==='GET'&&seg.length===2&&seg[1]!=='referenced';
}
async function handler(req:NextRequest,c:Params){const seg=await parts(c),name=seg[0],method=req.method,query=req.nextUrl.searchParams,body=()=>req.json();
 if(name==='health'&&method==='GET'){
  // Liveness only. Library prepare runs on first data API via store/db().
  // Awaiting prepare here blocked Windows CI when the first compile+lock race hung.
  return json({ok:true});
 }
 if(name==='libraries'){
  return handleLibraryApi(req,seg,method);
 }
 if(name==='update-status'&&method==='GET'){
  return json(await updateStatus(query.get('refresh')==='1'));
 }
 if(name==='update'&&method==='POST'){
  if(!assertLocalAppRequest(req,'x-atlas-update','1')) return Response.json({error:'Update requests must come from this app'},{status:403});
  if(updatePending)return Response.json({error:'An update is already in progress'},{status:409});
  updatePending=true;
  try{
   const status=await updateStatus();
   if(!status.canAutoUpdate || !status.updateAvailable){updatePending=false;return Response.json({error:'Automatic update is unavailable'},{status:409});}
   return Response.json(await requestManagedUpdate(),{status:202,headers:{'Cache-Control':'no-store'}});
  }catch(error){updatePending=false;throw error;}
 }
 if(DATA_ACTIONS.has(name)){
  if(isManagerMode()) return Response.json({error:'Open a library before using the workspace.',errorKey:'errors.library.required'},{status:409});
  const mediaBytes=isMediaBytesGet(name,method,seg);
  const stale=mediaBytes?runtimeSessionMismatch(req):runtimeHeaderMismatch(req);
  if(stale && stale!=='missing'){
   return Response.json({error:stale.message,errorKey:'errors.library.staleRuntime',expected:stale.expected,received:stale.received},{status:409});
  }
  // Managed runtimes require session proof on reads and writes so stale tabs cannot observe a new library.
  // Media bytes may prove via rt/lib query on the URL; all other data routes require headers.
  if(stale==='missing' && process.env.ATLAS_RUNTIME_ID && process.env.ATLAS_LIBRARY_MANAGER==='1'){
   return Response.json({error:'Missing runtime session headers. Reload the page.',errorKey:'errors.library.staleRuntime'},{status:409});
  }
 }
 if(DATA_ACTIONS.has(name)){
   const project=await ensureLibraryPrepared();
   if(project.folderMode){
     if(name!=='folder-files'){
       const handled=await folderWorkspaceRequest(project.root!,!!project.readOnly,seg,req);
       if(handled)return handled;
     }else{
     const core=await loadCore(), file=query.get('path');
     if(method==='GET'&&!file)return json({...await core.listFolderFiles(project.root),readOnly:!!project.readOnly});
     if(method==='GET'&&file&&query.has('revision'))return json(await core.folderRevision(project.root,file,query.get('revision')));
     if(method==='GET'&&file&&query.has('history'))return json(await core.folderRevisions(project.root,file));
     if(method==='GET'&&file)return json(await core.readFolderDocument(project.root,file));
     if(method==='PUT'&&file&&!project.readOnly){
       if(!assertLocalAppRequest(req,'x-atlas-library-api','1'))return json({error:'Local request required.'},403);
       const input=await body();
       if(typeof input.raw!=='string'||typeof input.version!=='string')return json({error:'Invalid edit.'},400);
       return withLibraryLock(async()=>{const result=await core.saveFolderDocument(project.root,file,input.raw,input.version);return json(result,result.conflict?409:200);});
     }
     return json({error:'This folder is read only.'},403);
     }
   }
 }
 if(name==='docs'){
   if(method==='GET'&&seg.length===1)return json(await listDocs(localeFromRequest(req)));
   if(method==='POST'&&seg.length===1){const o=await body();const kind=o.kind==='yaml'||o.kind==='sql'||o.kind==='json'?o.kind:'md';return json(await createDoc(String(o.folder),String(o.title),kind));}
   const id=seg.slice(1).join('/');safeDoc(id);
   if(method==='GET')return json(await getDoc(id));if(method==='PUT'){const o=await body();return json(await saveDoc(id,String(o.raw)));}if(method==='DELETE')return json(await deleteDoc(id));
 }
 if(name==='folders'){
   if(method==='GET')return json(await listFolders(localeFromRequest(req)));
   if(method==='DELETE')return json(await deleteFolder(query.get('path')||''));
   const o=await body();if(o.imageId){const a=(await readDB()).assets.find(a=>a.id===o.imageId);if(!a||assetKind(a.mimeType)!=='image')throw new AppError('errors.asset.coverMustBeImage');}if(method==='POST')return json({path:await createFolder(String(o.parent||''),String(o.title||''),o.imageId||null,o.icon??null)});
   if(method==='PATCH')return json(await updateFolder(String(o.path),String(o.title),o.imageId||null,o.icon??null));
 }
 if(name==='settings'){
   if(method==='GET')return json((await readDB()).settings);
   if(method==='PATCH')return withLibraryLock(async()=>{const o=await body();const allowed=['theme','leftWidth','rightWidth','pinnedFolders','hiddenFolders','sidebarSectionOrder','keymap','history','backup'];if(Object.keys(o).some(x=>!allowed.includes(x)))throw new AppError('errors.settings.unsupported');if('keymap' in o)o.keymap=sanitizeKeymap(o.keymap);if('history' in o)o.history=parseHistoryLimits(o.history);if('backup' in o)o.backup=parseBackupLimits(o.backup);if('sidebarSectionOrder' in o)o.sidebarSectionOrder=normalizeSidebarSectionOrder(o.sidebarSectionOrder);return json(await writeDB(d=>{d.settings={...d.settings,...o};return d.settings;}));});
 }
 if(name==='order'){
   if(method==='GET')return json((await readDB()).navigationOrder);
   if(method==='PUT'){const o=await body();return json(await reorder(String(o.parent||''),o.kind,o.items));}
 }
 if(name==='comments'){
   const docId=query.get('docId');if(method==='GET'){const all=(await readDB()).comments;return json(docId?all.filter(x=>x.docId===docId):all);}
   if(method==='POST')return withLibraryLock(async()=>{const o=await body();if((await ensureLibraryPrepared()).folderMode){if(!String(o.docId).startsWith('project/'))throw Error('Invalid document.');}else safeDoc(String(o.docId));if(typeof o.content!=='string'||!o.content.trim()||o.content.length>5000)throw new AppError('errors.comment.invalid');return json(await writeDB(d=>{const item={id:crypto.randomUUID(),docId:o.docId,content:o.content,quote:String(o.quote||'').slice(0,500),blockId:String(o.blockId||''),createdAt:new Date().toISOString(),resolved:false};d.comments.push(item);return item;}));});
   if(method==='PATCH')return withLibraryLock(async()=>{const o=await body();if(typeof o.content!=='string'||!o.content.trim()||o.content.length>5000)throw new AppError('errors.comment.invalid');return json(await writeDB(d=>{const item=d.comments.find(x=>x.id===o.id);if(!item)throw new AppError('errors.comment.missing');item.content=o.content;return item;}));});
   if(method==='DELETE')return withLibraryLock(async()=>{const id=query.get('id');return json(await writeDB(d=>{d.comments=d.comments.filter(x=>x.id!==id);return {ok:true};}));});
 }
 if(name==='history'){const id=query.get('id')||'';if(method==='GET'&&query.get('scan')==='1')return json(await historyOverLimit());if(method==='POST'&&query.get('preview')==='1')return json(await historyOverLimit(parseHistoryLimits(await body())));if(method==='GET'){if(query.has('revision'))return json({raw:await revisionRaw(id,query.get('revision')!)});if(query.get('detail')==='1')return json(await historyDetail(id,query.get('cursor')));return json({versions:await history(id)});}if(method==='POST'){const o=await body();return json(await restore(String(o.id),String(o.version),typeof o.baseHash==='string'?o.baseHash:undefined));}}
 if(name==='links'&&method==='GET')return json(await links(query.get('id')||''));
 if(name==='dashboard'&&method==='GET'){const [docs,folders,d]=await Promise.all([listDocs(),listFolders(),readDB()]);return json({docs:docs.length,folders:folders.length,topics:folders.filter(f=>f.depth===1).length,comments:d.comments.length,assets:d.assets.length});}
 if(name==='media'){
   const prepared=await ensureLibraryPrepared();
   const mediaRoot=prepared.folderMode?path.join(prepared.root!,'.atlas-folder-uploads'):uploadsRoot;
   const mediaId=(id:string)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new AppError('errors.asset.invalidId');return id;};
   const assetFile=async(entry:FormDataEntryValue|null,imagesOnly=false)=>{if(!(entry instanceof File))throw new AppError('errors.asset.missingUpload');const {ext,mime}=validateAsset(entry,imagesOnly);return {ext,bytes:new Uint8Array(await entry.arrayBuffer()),type:mime,name:entry.name,size:entry.size};};
   if(method==='GET'&&seg.length===1)return json((await readDB()).assets);
   if(method==='GET'&&seg.length===2&&seg[1]==='referenced')return json(await referencedMedia());
   if(method==='GET'&&seg.length===3&&seg[2]==='usage')return json(await mediaUsage(mediaId(seg[1])));
   if(method==='GET'&&seg.length===2){
     const asset=(await readDB()).assets.find(a=>a.id===mediaId(seg[1]));if(!asset)return new Response('Not found',{status:404});
     const filename=path.join(mediaRoot,asset.storedName),size=(await stat(filename)).size;
     const inline=['image','video','audio'].includes(assetKind(asset.mimeType))||asset.mimeType==='application/pdf';
     const headers:Record<string,string>={'Content-Type':asset.mimeType,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Disposition':`${query.get('download')==='1'||!inline?'attachment':'inline'}; filename="download.${assetExtension(asset.storedName)}"; filename*=UTF-8''${encodeURIComponent(asset.filename).replace(/['()]/g,c=>'%'+c.charCodeAt(0).toString(16))}`};
     const ranged=['video','audio'].includes(assetKind(asset.mimeType));if(ranged)headers['Accept-Ranges']='bytes';
     const range=ranged?req.headers.get('range'):null;
     if(range){
       const m=/^bytes=(\d*)-(\d*)$/.exec(range);let start=0,end=size-1;
       if(m&&(m[1]||m[2])){if(!m[1])start=Math.max(0,size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}}
       if(!m||(!m[1]&&!m[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});}
       const file=await open(filename,'r');try{const buffer=Buffer.alloc(end-start+1);await file.read(buffer,0,buffer.length,start);return new Response(new Uint8Array(buffer),{status:206,headers:{...headers,'Content-Length':String(buffer.length),'Content-Range':`bytes ${start}-${end}/${size}`}});}finally{await file.close();}
     }
     return new Response(new Uint8Array(await readFile(filename)),{headers:{...headers,'Content-Length':String(size)}});
   }
   if(method==='PUT'&&seg.length===2&&seg[1]==='order')return withLibraryLock(async()=>{const o=await body();const ids:string[]=Array.isArray(o.ids)?o.ids.map((x:unknown)=>String(x||'')):[];if(!ids.length||new Set(ids).size!==ids.length)throw new AppError('errors.asset.invalidOrder');return json(await writeDB(d=>{if(d.assets.length!==ids.length||ids.some((id:string)=>!d.assets.some(a=>a.id===id)))throw new AppError('errors.asset.invalidOrder');const map=new Map(d.assets.map(a=>[a.id,a]));d.assets=ids.map((id:string)=>map.get(id)!);return d.assets;}));});
   if(method==='POST'&&seg.length===1)return withLibraryLock(async()=>{const form=await req.formData(),file=await assetFile(form.get('file'));const alt=form.has('alt')?String(form.get('alt')):file.name;if(alt.length>300)throw new AppError('errors.asset.descriptionTooLong');const asked=String(form.get('source')||''),source:AssetSource=asked==='paste'?'paste':asked==='edit'?'edit':'upload';const id=crypto.randomUUID(),storedName=id+file.ext;const storedPath=path.join(mediaRoot,storedName);await mkdir(mediaRoot,{recursive:true});await writeFile(storedPath,file.bytes);try{return json(await writeDB(d=>{const a={id,filename:file.name,storedName,mimeType:file.type,size:file.size,alt,source,createdAt:new Date().toISOString()};d.assets.push(a);return a;}));}catch(e){await rm(storedPath,{force:true}).catch(()=>{});throw e;}});
   if(method==='PATCH'&&seg.length===2)return withLibraryLock(async()=>{const id=mediaId(seg[1]),o=await body(),filename=String(o.filename??'').trim(),alt=String(o.alt??'').trim();if(!filename||filename.length>180)throw new AppError('errors.asset.invalidName');if(alt.length>300)throw new AppError('errors.asset.descriptionTooLong');return json(await writeDB(d=>{const a=d.assets.find(x=>x.id===id);if(!a)throw new AppError('errors.asset.notFound');if(/[\x00-\x1f/\\]/.test(filename)||assetExtension(filename)!==assetExtension(a.filename))throw new AppError('errors.asset.keepExtension');a.filename=filename;a.alt=alt;return a;}));});
   if(method==='PUT'&&seg.length===2)return withLibraryLock(async()=>{const id=mediaId(seg[1]),file=await assetFile((await req.formData()).get('file'),true),storedName=id+file.ext;const current=await writeDB(d=>{const a=d.assets.find(x=>x.id===id);if(!a)throw new AppError('errors.asset.notFound');if(assetKind(a.mimeType)!=='image')throw new AppError('errors.asset.imagesOnlyEdit');return a.storedName;});await mkdir(mediaRoot,{recursive:true});await writeFile(path.join(mediaRoot,storedName),file.bytes);const saved=await writeDB(d=>{const a=d.assets.find(x=>x.id===id);if(!a)throw new AppError('errors.asset.notFound');a.filename=a.filename.replace(/\.[^.]+$/,'')+file.ext;a.storedName=storedName;a.mimeType=file.type;a.size=file.size;a.source='edit';return a;});if(current!==storedName)await rm(path.join(mediaRoot,current),{force:true});return json(saved);});
   if(method==='DELETE'&&seg.length===2)return withLibraryLock(async()=>{const id=mediaId(seg[1]);const removed=await writeDB(d=>{const a=d.assets.find(x=>x.id===id);if(!a)throw new AppError('errors.asset.notFound');d.assets=d.assets.filter(x=>x.id!==id);let cover=false;for(const f of d.folders)if(f.imageId===id){f.imageId=null;cover=true;}return {storedName:a.storedName,cover};});if(removed.cover)invalidateLibrary();await rm(path.join(mediaRoot,removed.storedName),{force:true});return json({ok:true});});
 }
 if(name==='storage'){
   if(method==='GET')return json(await storageStats(query.get('refresh')==='1'));
   if(method==='POST'&&seg[1]==='scan')return json(await scanCleanup());
   if(method==='POST'&&seg[1]==='cleanup'){const o=await body();return json(await applyCleanup(String(o.scannedAt||''),o.ids));}
 }
 if(name==='backup'){
   if(method==='GET'&&query.get('check')==='1')return json(await inspectBackup());
   if(method==='GET'){const exp=await exportZip();const node=createReadStream(exp.file);const cleanup=()=>{void exp.cleanup();};node.on('close',cleanup);node.on('error',cleanup);return new Response(Readable.toWeb(node) as ReadableStream,{headers:{'Content-Type':'application/zip','Content-Length':String(exp.bytes),'Content-Disposition':'attachment; filename="atlas-backup.zip"','Cache-Control':'no-store'}});}
   if(method==='POST'){const type=req.headers.get('content-type')||'';if(!type.includes('application/zip')&&!type.includes('application/octet-stream'))throw new AppError('errors.backup.zipContentType');const received=await receiveZip(req.body);try{return json(await importZip(received.file));}catch(e){await rm(received.file,{force:true}).catch(()=>{});throw e;}}
 }
 return new Response('Not found',{status:404});
}
export async function GET(r:NextRequest,c:Params){try{return await handler(r,c);}catch(e){return err(e);}}
export async function POST(r:NextRequest,c:Params){try{return await handler(r,c);}catch(e){return err(e);}}
export async function PUT(r:NextRequest,c:Params){try{return await handler(r,c);}catch(e){return err(e);}}
export async function PATCH(r:NextRequest,c:Params){try{return await handler(r,c);}catch(e){return err(e);}}
export async function DELETE(r:NextRequest,c:Params){try{return await handler(r,c);}catch(e){return err(e);}}
