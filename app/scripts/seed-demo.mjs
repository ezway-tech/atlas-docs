import {constants} from 'node:fs';
import {mkdir,readdir,readFile,lstat,copyFile,rm,rename,rmdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
export const demoRoot=path.resolve(here,'../../examples/little-cafe');

export async function sampleFiles(root){
  const files=[];
  async function walk(dir,prefix=''){
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const rel=prefix+entry.name;
      if(entry.isSymbolicLink())throw Error('Demo must not contain symlinks: '+rel);
      if(entry.isDirectory())await walk(path.join(dir,entry.name),rel+'/');
      else if(entry.isFile())files.push(rel);
      else throw Error('Unsupported demo entry: '+rel);
    }
  }
  await walk(root);return files;
}

export async function validateDemo(root){
  const files=await sampleFiles(root),known=new Set(files);
  if(files.some(f=>f!=='db.json'&&!/^(docs|uploads|history)\/[a-zA-Z0-9_./ -]+$/.test(f)))throw Error('Unexpected demo file');
  const db=JSON.parse(await readFile(path.join(root,'db.json'),'utf8'));
  if(!['folders','assets','comments'].every(k=>Array.isArray(db[k]))||!db.settings||!db.navigationOrder)throw Error('Invalid demo database');
  const docs=files.filter(f=>f.startsWith('docs/'));
  if(!docs.length)throw Error('Demo has no documents');
  const ids=new Set(db.assets.map(a=>a.id));
  if(ids.size!==db.assets.length)throw Error('Duplicate demo asset');
  for(const a of db.assets){
    if(!/^[0-9a-f-]{36}$/.test(a.id)||!known.has('uploads/'+a.storedName))throw Error('Missing demo asset: '+a.id);
    if((await lstat(path.join(root,'uploads',a.storedName))).size!==a.size)throw Error('Invalid asset size: '+a.id);
  }
  for(const f of db.folders){
    if(!docs.some(d=>d.startsWith('docs/'+f.path+'/')))throw Error('Missing demo folder: '+f.path);
    if(f.imageId&&!ids.has(f.imageId))throw Error('Missing folder image');
  }
  for(const c of db.comments){
    if(!known.has('docs/'+c.docId+'.md'))throw Error('Missing comment document');
    if(c.quote&&!(await readFile(path.join(root,'docs',c.docId+'.md'),'utf8')).includes(c.quote))throw Error('Missing comment quote');
  }
  for(const file of docs){
    const raw=await readFile(path.join(root,file),'utf8');
    if(file.endsWith('.json'))JSON.parse(raw);
    for(const m of raw.matchAll(/\[\[([\w/-]+)\]\]/g)){
      if(!known.has('docs/'+m[1]+'.md'))throw Error('Broken demo wiki link: '+m[1]+' in '+file);
    }
    for(const m of raw.matchAll(/\/api\/media\/([0-9a-f-]+)/g))if(!ids.has(m[1]))throw Error('Missing media reference: '+file);
    for(const m of raw.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
      const href=m[1];if(href.startsWith('/api/media/')||href.startsWith('#'))continue;
      if(/^[a-z]+:/i.test(href))throw Error('Demo must be self-contained: '+href);
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),href.split('#')[0]));
      if(!known.has(target))throw Error('Broken demo link: '+href+' in '+file);
    }
  }
  return files;
}

async function assertEmpty(root){
  let entries;
  try{entries=await readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const entry of entries){
    if(entry.name==='.gitkeep'&&entry.isFile())continue;
    if(entry.name==='db.json'&&entry.isFile()){
      const db=JSON.parse(await readFile(path.join(root,entry.name),'utf8'));
      if(!['assets','folders','comments'].every(k=>Array.isArray(db[k])&&db[k].length===0))throw Error('Library is not empty');
    }else if(['docs','uploads','history'].includes(entry.name)&&entry.isDirectory()){
      if((await readdir(path.join(root,entry.name))).length)throw Error('Library is not empty');
    }else throw Error('Library contains existing files: '+entry.name);
  }
}

export async function seedDemo(root,sample=demoRoot){
  // Validate before touching the destination. Run with the app stopped.
  const files=await validateDemo(sample);
  await assertEmpty(root);
  await mkdir(root,{recursive:true});
  const written=[],createdDirs=new Set();
  const pendingDb=path.join(root,'.seed-'+randomUUID()+'.json');
  try{
    for(const file of files.filter(f=>f!=='db.json')){
      const dest=path.join(root,file);
      let dir=root;
      for(const part of file.split('/').slice(0,-1)){
        dir=path.join(dir,part);
        try{await mkdir(dir);createdDirs.add(dir);}catch(e){if(e.code!=='EEXIST')throw e;}
      }
      await copyFile(path.join(sample,file),dest,constants.COPYFILE_EXCL);written.push(dest);
    }
    await writeFile(pendingDb,await readFile(path.join(sample,'db.json')),{flag:'wx'});
    await rename(pendingDb,path.join(root,'db.json'));
  }catch(e){
    for(const file of written)await rm(file,{force:true});
    // Remove only directories created here, and only if they are still empty.
    for(const dir of [...createdDirs].reverse())await rmdir(dir).catch(()=>{});
    throw e;
  }finally{await rm(pendingDb,{force:true});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(process.env.DATA_DIR||path.join(process.cwd(),'..','data'));
  try{await seedDemo(root);console.log('[Atlas Docs] Little Café demo loaded:',root);}
  catch(e){console.error('[Atlas Docs] Demo not loaded:',e.message,'\nUse an empty DATA_DIR and stop the app before seeding.');process.exitCode=1;}
}
