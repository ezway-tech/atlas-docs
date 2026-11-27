import path from 'node:path';
import {mkdir, readFile, realpath, unlink, rmdir, writeFile, stat} from 'node:fs/promises';
import type {NextRequest} from 'next/server';
import {loadCore} from './load-core';
import {defaults, mapDoc, readDB, writeDB, slug, withLibraryLock} from './store';
import {effectiveHistoryLimits} from './history-policy';
import type {DocInfo, Folder} from './types';

function segment(name:string){
  return /^[a-zA-Z0-9_. -]+$/.test(name)?name:'~'+Buffer.from(name).toString('base64url');
}
function filePath(id:string){
  const [prefix,...parts]=id.split('/');
  if(prefix!=='project'||!parts.length)throw Error('Invalid project path.');
  return parts.map(part=>{
    const name=part.startsWith('~')?Buffer.from(part.slice(1),'base64url').toString():part;
    if(!name||name.startsWith('.')||/[\\/:\x00]/.test(name)||name.toLowerCase()==='node_modules'||segment(name)!==part)throw Error('Invalid project path.');
    return name;
  }).join('/');
}
const response=(data:unknown,status=200)=>Response.json(data,{status});

export async function folderWorkspaceRequest(root:string,readOnly:boolean,seg:string[],req:NextRequest){
  const [name,...tail]=seg, method=req.method, query=req.nextUrl.searchParams;
  if(readOnly&&method!=='GET')return response({error:'This folder is read only. Grant write access and reopen it to make changes.'},403);
  const core=await loadCore();
  async function document(id:string){
    const file=filePath(id);
    const {raw,version}=await core.readFolderDocument(root,file);
    const info=await stat(path.join(root,file));
    const doc=mapDoc(id,raw,info.mtime.toISOString());
    return {...doc,title:doc.title===id.split('/').at(-1)?path.basename(file):doc.title,version};
  }
  async function directory(id:string){
    const target=!id||id==='project'?root:path.join(root,filePath(id));
    if(await realpath(target)!==target||!(await stat(target)).isDirectory())throw Error('Choose a folder inside this project.');
    return target;
  }
  if(method==='POST'&&(name==='folders'||name==='docs')){
    const input=await req.json(), parent=input.parent||input.folder||'project';
    return withLibraryLock(async()=>{
      const dir=await directory(parent), basename=slug(String(input.title||''));
      if(name==='folders'){
        await mkdir(path.join(dir,basename));
        const id=parent+'/'+basename;
        await writeDB(db=>{db.folders.push({path:id,title:String(input.title),imageId:null,icon:null});});
        return response({path:id});
      }
      const ext=['json','yaml','sql'].includes(input.kind)?input.kind:'md';
      const filename=basename+'.'+ext;
      await writeFile(path.join(dir,filename),ext==='md'?'# '+input.title+'\n':ext==='json'?'{}\n':'',{flag:'wx'});
      return response(await document(parent+'/'+filename));
    });
  }
  if(name==='folders'&&method==='PATCH'){
    const input=await req.json();
    await directory(input.path);
    return response(await writeDB(db=>{
      const folder={path:input.path,title:String(input.title),icon:input.icon||null,imageId:input.imageId||null};
      db.folders=db.folders.filter(item=>item.path!==input.path).concat(folder);
      return folder;
    }));
  }
  if(name==='folders'&&method==='DELETE'){
    const id=query.get('path');
    if(!id||id==='project')return response({error:'Choose a subfolder.'},400);
    await rmdir(await directory(id));
    return response({ok:true});
  }
  if(name==='folder-image'&&method==='GET'){
    const file=filePath(tail.join('/')), target=path.join(root,file);
    const types:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'};
    const mime=types[path.extname(file).toLowerCase()];
    if(!mime||await realpath(target)!==target)return response({error:'Unavailable image.'},404);
    const info=await stat(target);
    if(!info.isFile()||info.size>32*1024*1024)return response({error:'Unavailable image.'},413);
    return new Response(new Uint8Array(await readFile(target)),{headers:{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
  }
  if(name==='docs'&&tail.length){
    const id=tail.join('/');
    if(method==='GET')return response(await document(id));
    if(method==='DELETE'){
      await document(id);
      await unlink(path.join(root,filePath(id)));
      return response({ok:true});
    }
    if(method==='PUT'){
      const {raw,version}=await req.json();
      if(typeof raw!=='string'||typeof version!=='string')return response({error:'Reload the document before saving.'},400);
      return withLibraryLock(async()=>{
        const result=await core.saveFolderDocument(root,filePath(id),raw,version);
        return result.conflict?response({error:'The file changed on disk. Copy your draft before reloading.'},409):response(await document(id));
      });
    }
  }
  if(method==='GET'&&['docs','folders','dashboard'].includes(name)){
    const {files,directories=[]}=await core.listFolderFiles(root);
    const folders=new Map<string,Folder>();
    const docs:DocInfo[]=[];
    let documentCount=0;
    folders.set('project',{path:'project',title:path.basename(root),depth:1,icon:null,imageId:null});
    for(const dir of directories as string[]){
      const parts=dir.split('/'), id='project/'+parts.map(segment).join('/');
      folders.set(id,{path:id,title:parts.at(-1)!,depth:parts.length+1,icon:null,imageId:null});
    }
    for(const file of files){
      const parts=(file.path as string).split('/');
      let parent='project';
      for(const [index,dir] of parts.slice(0,-1).entries()){
        parent+='/'+segment(dir);
        folders.set(parent,{path:parent,title:dir,depth:index+2,icon:null,imageId:null});
      }
      if(name==='folders'||!file.supported)continue;
      try{
        if(name==='dashboard'){documentCount++;continue;}
        const {raw,content,...summary}=await document(parent+'/'+segment(parts.at(-1)!));
        docs.push(summary);
      }catch{
        const id=parent+'/'+segment(parts.at(-1)!);
        docs.push({id,title:parts.at(-1)!,category:parent,kind:'md',description:'Cannot read this file. Check its permissions, size and UTF-8 encoding, then reopen it.',order:999,updatedAt:'',text:'',headings:[]});
      }
    }
    if(name==='docs')return response(docs);
    if(name==='folders'){
      const saved=readOnly?[]:(await readDB()).folders;
      return response([...folders.values()].map(folder=>({...folder,...saved.find(item=>item.path===folder.path)})));
    }
    const db=readOnly?null:await readDB();
    return response({docs:documentCount,folders:folders.size,topics:1,assets:db?.assets.length||0,comments:db?.comments.length||0});
  }
  if(name==='history'&&!query.has('scan')&&!query.has('preview')){
    if(method==='POST'){
      const {id,version,baseHash}=await req.json();
      return withLibraryLock(async()=>{
        const file=filePath(id), revision=await core.folderRevision(root,file,version);
        const saved=await core.saveFolderDocument(root,file,revision.raw,baseHash);
        return saved.conflict?response({error:'The file changed on disk.'},409):response(await document(id));
      });
    }
    const file=filePath(query.get('id')||'');
    if(query.has('revision'))return response(await core.folderRevision(root,file,query.get('revision')));
    const versions:string[]=await core.folderRevisions(root,file);
    if(!query.has('detail'))return response({versions});
    const items=await Promise.all(versions.map(async id=>({id,capturedAt:new Date(Number(id.slice(0,13))).toISOString(),reason:'edit',sizeBytes:Buffer.byteLength((await core.folderRevision(root,file,id)).raw)})));
    return response({items,totalCount:items.length,totalBytes:items.reduce((sum,item)=>sum+item.sizeBytes,0),nextCursor:null,limits:effectiveHistoryLimits(defaults)});
  }
  if(name==='order'&&method==='PUT'){
    const {kind,parent,items}=await req.json();
    if(!['docs','folders'].includes(kind)||typeof parent!=='string'||!Array.isArray(items)||!items.every(item=>typeof item==='string'))return response({error:'Invalid order.'},400);
    return response(await writeDB(db=>{db.navigationOrder[kind+':'+parent]=items;return items;}));
  }
  if(['settings','order','comments'].includes(name)){
    if(!readOnly)return null;
    return response(name==='settings'?defaults:name==='order'?{}:[]);
  }
  if(name==='links'){
    const id=query.get('id')||'', source=filePath(id);
    const {files}=await core.listFolderFiles(root);
    const incoming:DocInfo[]=[],outgoing:DocInfo[]=[],related:DocInfo[]=[];
    function targets(content:string,file:string){
      return [...content.matchAll(/\[[^\]]*\]\(([^ )#]+)(?:#[^)]*)?\)/g)].map(match=>path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1])));
    }
    const origin=await document(id), linked=targets(origin.content||'',source);
    for(const file of files){
      if(!file.supported||file.path===source)continue;
      try{
        const doc=await document('project/'+file.path.split('/').map(segment).join('/'));
        const {content,raw,...brief}=doc;
        if(targets(content||'',file.path).includes(source))incoming.push(brief);
        else if(linked.includes(file.path))outgoing.push(brief);
        else if(brief.category===origin.category&&related.length<6)related.push(brief);
      }catch{continue;}
    }
    return response({incoming,outgoing,related});
  }
  if(name==='media'){
    if(readOnly)return method==='GET'&&!tail.length?response([]):response({error:'Media unavailable.'},404);
    const uploads=path.join(root,'.atlas-folder-uploads');
    if(method==='POST')await mkdir(uploads,{recursive:true});
    if(method==='POST'||tail.length&&tail[0]!=='referenced'){
      if(await realpath(uploads)!==uploads)throw Error('Invalid uploads directory.');
    }
    return null;
  }
  return response({error:'This operation is unavailable for this folder.'},409);
}
