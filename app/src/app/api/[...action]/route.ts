import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {NextRequest} from 'next/server';
import {ROOT,uploadsRoot,folderFile,createFolder,createDoc,deleteDoc,deleteFolder,getDoc,listDocs,listFolders,readDB,writeDB,saveDoc,updateFolder,safeDoc,safeFolder} from '@/lib/store';
import {history,revisionRaw,restore,reorder,links,exportZip,importZip} from '@/lib/extras';
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
   const o=await body();if(method==='POST')return json({path:await createFolder(String(o.parent||''),String(o.title||''),o.imageId||null,o.icon??null)});
   if(method==='PATCH')return json(await updateFolder(String(o.path),String(o.title),o.imageId||null,o.icon??null));
 }
 if(name==='settings'){
   if(method==='GET')return json((await readDB()).settings);
   if(method==='PATCH'){const o=await body();const allowed=['theme','leftWidth','rightWidth','pinnedFolders','hiddenFolders'];if(Object.keys(o).some(x=>!allowed.includes(x)))throw Error('Unsupported setting');return json(await writeDB(d=>{d.settings={...d.settings,...o};return d.settings;}));}
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
   if(method==='GET'&&seg.length===1)return json((await readDB()).assets);
   if(method==='GET'&&seg.length===2){const asset=(await readDB()).assets.find(a=>a.id===seg[1]);if(!asset)return new Response('Not found',{status:404});const data=await readFile(path.join(uploadsRoot,asset.storedName));return new Response(new Uint8Array(data),{headers:{'Content-Type':asset.mimeType,'Cache-Control':'public, max-age=3600'}});}
   if(method==='POST'){const form=await req.formData(),file=form.get('file');if(!(file instanceof File)||file.size>8*1024*1024)throw Error('Upload must be an image up to 8MB');const types:{[k:string]:string}={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'};if(!types[file.type])throw Error('Unsupported image type');const id=crypto.randomUUID(),storedName=id+types[file.type];await mkdir(uploadsRoot,{recursive:true});await writeFile(path.join(uploadsRoot,storedName),new Uint8Array(await file.arrayBuffer()));return json(await writeDB(d=>{const a={id,filename:file.name,storedName,mimeType:file.type,size:file.size,alt:file.name,createdAt:new Date().toISOString()};d.assets.push(a);return a;}));}
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
