import {validateAsset,assetKind,assetExtension} from '@/lib/assets';
import {mkdir,readFile,writeFile,stat,rm,open} from 'node:fs/promises';
import path from 'node:path';
import {NextRequest} from 'next/server';
import {ROOT,uploadsRoot,folderFile,createFolder,createDoc,deleteDoc,deleteFolder,getDoc,listDocs,listFolders,readDB,writeDB,saveDoc,updateFolder,safeDoc,safeFolder,readLibrary,invalidateLibrary} from '@/lib/store';
import type {AssetSource} from '@/lib/types';
import {history,revisionRaw,restore,reorder,links,exportZip,importZip} from '@/lib/extras';
import {sanitizeKeymap} from '@/lib/keymap';
import {err} from '@/lib/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Params={params:Promise<{action:string[]}>};
const json=(x:unknown)=>Response.json(x,{headers:{'Cache-Control':'no-store'}});
const parts=async(c:Params)=>(await c.params).action;
async function handler(req:NextRequest,c:Params){const seg=await parts(c),name=seg[0],method=req.method,query=req.nextUrl.searchParams,body=()=>req.json();
 if(name==='health'&&method==='GET')return json({ok:true});
 if(name==='docs'){
   if(method==='GET'&&seg.length===1)return json(await listDocs());
   if(method==='POST'&&seg.length===1){const o=await body();const kind=o.kind==='yaml'||o.kind==='sql'?o.kind:'md';return json(await createDoc(String(o.folder),String(o.title),kind));}
   const id=seg.slice(1).join('/');safeDoc(id);
   if(method==='GET')return json(await getDoc(id));if(method==='PUT'){const o=await body();return json(await saveDoc(id,String(o.raw)));}if(method==='DELETE')return json(await deleteDoc(id));
 }
 if(name==='folders'){
   if(method==='GET')return json(await listFolders());
   if(method==='DELETE')return json(await deleteFolder(query.get('path')||''));
   const o=await body();if(o.imageId){const a=(await readDB()).assets.find(a=>a.id===o.imageId);if(!a||assetKind(a.mimeType)!=='image')throw Error('Ảnh bìa phải là tệp ảnh');}if(method==='POST')return json({path:await createFolder(String(o.parent||''),String(o.title||''),o.imageId||null,o.icon??null)});
   if(method==='PATCH')return json(await updateFolder(String(o.path),String(o.title),o.imageId||null,o.icon??null));
 }
 if(name==='settings'){
   if(method==='GET')return json((await readDB()).settings);
   if(method==='PATCH'){const o=await body();const allowed=['theme','leftWidth','rightWidth','pinnedFolders','hiddenFolders','keymap'];if(Object.keys(o).some(x=>!allowed.includes(x)))throw Error('Unsupported setting');if('keymap' in o)o.keymap=sanitizeKeymap(o.keymap);return json(await writeDB(d=>{d.settings={...d.settings,...o};return d.settings;}));}
 }
 if(name==='order'){
   if(method==='GET')return json((await readDB()).navigationOrder);
   if(method==='PUT'){const o=await body();return json(await reorder(String(o.parent||''),o.kind,o.items));}
 }
 if(name==='comments'){
   const docId=query.get('docId');if(method==='GET'){const all=(await readDB()).comments;return json(docId?all.filter(x=>x.docId===docId):all);}
   if(method==='POST'){const o=await body();safeDoc(String(o.docId));if(typeof o.content!=='string'||!o.content.trim()||o.content.length>5000)throw Error('Comment text invalid');return json(await writeDB(d=>{const item={id:crypto.randomUUID(),docId:o.docId,content:o.content,quote:String(o.quote||'').slice(0,500),blockId:String(o.blockId||''),createdAt:new Date().toISOString(),resolved:false};d.comments.push(item);return item;}));}
   if(method==='PATCH'){const o=await body();if(typeof o.content!=='string'||!o.content.trim()||o.content.length>5000)throw Error('Comment text invalid');return json(await writeDB(d=>{const item=d.comments.find(x=>x.id===o.id);if(!item)throw Error('Comment missing');item.content=o.content;return item;}));}
   if(method==='DELETE'){const id=query.get('id');return json(await writeDB(d=>{d.comments=d.comments.filter(x=>x.id!==id);return {ok:true};}));}
 }
 if(name==='history'){const id=query.get('id')||'';if(method==='GET')return query.has('revision')?json({raw:await revisionRaw(id,query.get('revision')!)}):json({versions:await history(id)});if(method==='POST'){const o=await body();return json(await restore(o.id,o.version));}}
 if(name==='links'&&method==='GET')return json(await links(query.get('id')||''));
 if(name==='dashboard'&&method==='GET'){const [docs,folders,d]=await Promise.all([listDocs(),listFolders(),readDB()]);return json({docs:docs.length,folders:folders.length,topics:folders.filter(f=>f.depth===1).length,comments:d.comments.length,assets:d.assets.length});}
 if(name==='media'){
   const mediaId=(id:string)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Asset id invalid');return id;};
   const assetFile=async(entry:FormDataEntryValue|null,imagesOnly=false)=>{if(!(entry instanceof File))throw Error('Thiếu tệp tải lên');const {ext,mime}=validateAsset(entry,imagesOnly);return {ext,bytes:new Uint8Array(await entry.arrayBuffer()),type:mime,name:entry.name,size:entry.size};};
   if(method==='GET'&&seg.length===1)return json((await readDB()).assets);
   if(method==='GET'&&seg.length===2&&seg[1]==='referenced'){const [lib,d]=await Promise.all([readLibrary(),readDB()]);const ids=new Set<string>();for(const folder of d.folders)if(folder.imageId)ids.add(folder.imageId);const hay=[...lib.docs.filter(doc=>doc.kind==='md').map(doc=>doc.raw||''),...d.comments.map(comment=>comment.content)].join('\n');for(const asset of d.assets)if(hay.includes('/api/media/'+asset.id))ids.add(asset.id);return json({ids:[...ids]});}
   if(method==='GET'&&seg.length===3&&seg[2]==='usage'){const id=mediaId(seg[1]),needle='/api/media/'+id;const [lib,d]=await Promise.all([readLibrary(),readDB()]);return json({folders:d.folders.filter(f=>f.imageId===id).map(f=>({path:f.path,title:f.title})),docs:lib.docs.filter(doc=>doc.kind==='md'&&(doc.raw||'').includes(needle)).map(doc=>({id:doc.id,title:doc.title})),comments:d.comments.filter(c=>c.content.includes(needle)).map(c=>({id:c.id,docId:c.docId}))});}
   if(method==='GET'&&seg.length===2){
     const asset=(await readDB()).assets.find(a=>a.id===mediaId(seg[1]));if(!asset)return new Response('Not found',{status:404});
     const filename=path.join(uploadsRoot,asset.storedName),size=(await stat(filename)).size;
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
   if(method==='POST'&&seg.length===1){const form=await req.formData(),file=await assetFile(form.get('file'));const alt=form.has('alt')?String(form.get('alt')):file.name;if(alt.length>300)throw Error('Mô tả quá dài');const asked=String(form.get('source')||''),source:AssetSource=asked==='paste'?'paste':asked==='edit'?'edit':'upload';const id=crypto.randomUUID(),storedName=id+file.ext;await mkdir(uploadsRoot,{recursive:true});await writeFile(path.join(uploadsRoot,storedName),file.bytes);return json(await writeDB(d=>{const a={id,filename:file.name,storedName,mimeType:file.type,size:file.size,alt,source,createdAt:new Date().toISOString()};d.assets.push(a);return a;}));}
   if(method==='PATCH'&&seg.length===2){const id=mediaId(seg[1]),o=await body(),filename=String(o.filename??'').trim(),alt=String(o.alt??'').trim();if(!filename||filename.length>180)throw Error('Tên tệp không hợp lệ');if(alt.length>300)throw Error('Mô tả quá dài');return json(await writeDB(d=>{const a=d.assets.find(x=>x.id===id);if(!a)throw Error('Tệp không tồn tại');if(/[\x00-\x1f/\\]/.test(filename)||assetExtension(filename)!==assetExtension(a.filename))throw Error('Tên tệp phải giữ nguyên phần mở rộng');a.filename=filename;a.alt=alt;return a;}));}
   if(method==='PUT'&&seg.length===2){const id=mediaId(seg[1]),file=await assetFile((await req.formData()).get('file'),true),storedName=id+file.ext;const current=await writeDB(d=>{const a=d.assets.find(x=>x.id===id);if(!a)throw Error('Tệp không tồn tại');if(assetKind(a.mimeType)!=='image')throw Error('Chỉ có thể sửa ảnh');return a.storedName;});await mkdir(uploadsRoot,{recursive:true});await writeFile(path.join(uploadsRoot,storedName),file.bytes);const saved=await writeDB(d=>{const a=d.assets.find(x=>x.id===id);if(!a)throw Error('Tệp không tồn tại');a.filename=a.filename.replace(/\.[^.]+$/,'')+file.ext;a.storedName=storedName;a.mimeType=file.type;a.size=file.size;a.source='edit';return a;});if(current!==storedName)await rm(path.join(uploadsRoot,current),{force:true});return json(saved);}
   if(method==='DELETE'&&seg.length===2){const id=mediaId(seg[1]);const removed=await writeDB(d=>{const a=d.assets.find(x=>x.id===id);if(!a)throw Error('Tệp không tồn tại');d.assets=d.assets.filter(x=>x.id!==id);let cover=false;for(const f of d.folders)if(f.imageId===id){f.imageId=null;cover=true;}return {storedName:a.storedName,cover};});if(removed.cover)invalidateLibrary();await rm(path.join(uploadsRoot,removed.storedName),{force:true});return json({ok:true});}
 }
 if(name==='backup'){
   if(method==='GET')return new Response(new Uint8Array(await exportZip()),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="atlas-backup.zip"'}});
   if(method==='POST'){const form=await req.formData(),file=form.get('file');if(!(file instanceof File)||file.size>120*1024*1024)throw Error('ZIP required (max 120 MB)');return json(await importZip(new Uint8Array(await file.arrayBuffer())));}
 }
 return new Response('Not found',{status:404});
}
export async function GET(r:NextRequest,c:Params){try{return await handler(r,c);}catch(e){return err(e);}}
export async function POST(r:NextRequest,c:Params){try{return await handler(r,c);}catch(e){return err(e);}}
export async function PUT(r:NextRequest,c:Params){try{return await handler(r,c);}catch(e){return err(e);}}
export async function PATCH(r:NextRequest,c:Params){try{return await handler(r,c);}catch(e){return err(e);}}
export async function DELETE(r:NextRequest,c:Params){try{return await handler(r,c);}catch(e){return err(e);}}
