import {createWriteStream} from 'node:fs';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {loadTs} from './load-ts.mjs';

const limits={maxUncompressedBytes:1024*1024*1024,maxZipBytes:1024*1024*1024,maxDataFiles:100000};
const db=(extra={})=>({assets:[],folders:[{path:'topic',title:'Topic',imageId:null}],comments:[],navigationOrder:{},settings:{theme:'dark',leftWidth:265,rightWidth:335,pinnedFolders:[],hiddenFolders:[],keymap:{}},...extra});
if(process.argv[2]==='import'){
 process.env.DATA_DIR=process.argv[3];
 const started=process.memoryUsage().rss;
 const mod=await loadTs('src/lib/backup.ts');
 const result=await mod.importZip(process.argv[4],{deleteZip:false,limits,metrics:true});
 console.log(JSON.stringify({ok:result.ok,files:result.files,uncompressedBytes:result.uncompressedBytes,started,peakRss:result.peakRss}));
 process.exit(0);
}
async function fill(dir,docs,versions,blobBytes=0){
 await mkdir(path.join(dir,'docs','topic'),{recursive:true});
 await mkdir(path.join(dir,'uploads'),{recursive:true});
 await mkdir(path.join(dir,'history'),{recursive:true});
 for(let i=0;i<docs;i++){
  const name='doc-'+i;
  await writeFile(path.join(dir,'docs','topic',name+'.md'),'---\ntitle: "'+name+'"\n---\n\n# '+name+'\n');
  const hist=path.join(dir,'history','topic',name);
  await mkdir(hist,{recursive:true});
  for(let v=0;v<versions;v++){
   const rev='2026-01-01T00-00-'+String(v).padStart(2,'0')+'-000Z_'+randomUUID()+'.md';
   await writeFile(path.join(hist,rev),'# '+name+' '+v+'\n');
   await writeFile(path.join(hist,rev.replace(/\.md$/,'.json')),JSON.stringify({capturedAt:'2026-01-01T00:00:'+String(v).padStart(2,'0')+'.000Z',reason:'edit'}));
  }
 }
 if(blobBytes){
  const stored='blob-'+randomUUID()+'.bin';
  const out=createWriteStream(path.join(dir,'uploads',stored));
  const chunk=Buffer.alloc(1024*1024,7);
  let left=blobBytes;
  while(left>0){const size=Math.min(chunk.length,left);if(!out.write(chunk.subarray(0,size)))await once(out,'drain');left-=size;}
  await new Promise((resolve,reject)=>{out.end(resolve);out.on('error',reject);});
  const data=db();
  data.assets.push({id:randomUUID(),filename:'blob.bin',storedName:stored,mimeType:'application/octet-stream',size:blobBytes,alt:'',source:'upload',createdAt:new Date().toISOString()});
  await writeFile(path.join(dir,'db.json'),JSON.stringify(data));
 }else await writeFile(path.join(dir,'db.json'),JSON.stringify(db()));
}
async function measure(label,docs,versions,blobBytes){
 const source=await mkdtemp(path.join(tmpdir(),'atlas-load-src-'));
 const target=await mkdtemp(path.join(tmpdir(),'atlas-load-dst-'));
 process.env.DATA_DIR=source;
 try{
  await fill(source,docs,versions,blobBytes);
  const mod=await loadTs('src/lib/backup.ts');
  const started=process.memoryUsage().rss;
  const begun=Date.now();
  const exported=await mod.exportZip({limits,metrics:true});
  const exportMs=Date.now()-begun;
  const boot=spawnSync(process.execPath,['scripts/bootstrap.mjs'],{cwd:process.cwd(),env:{...process.env,DATA_DIR:target},encoding:'utf8'});
  if(boot.status!==0)throw Error(boot.stderr);
  const child=spawnSync(process.execPath,['--experimental-strip-types','scripts/test-backup-load.mjs','import',target,exported.file],{cwd:process.cwd(),env:{...process.env,DATA_DIR:target},encoding:'utf8',maxBuffer:10*1024*1024});
  if(child.status!==0)throw Error(child.stderr||child.stdout);
  const imported=JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  if(!imported.ok||imported.files!==exported.files)throw Error('Import did not keep the file count');
  const row={label,docs,versions,blobBytes,files:exported.files,uncompressedBytes:exported.uncompressedBytes,zipBytes:exported.bytes,exportMs,exportStartRss:started,exportPeakRss:exported.peakRss,importStartRss:imported.started,importPeakRss:imported.peakRss};
  console.log(JSON.stringify(row));
  if(blobBytes>120*1024*1024&&(exported.peakRss-started>80*1024*1024||imported.peakRss-imported.started>80*1024*1024))throw Error('Memory grew as if the library was held uncompressed: '+JSON.stringify(row));
  await exported.cleanup();
 }finally{
  await rm(source,{recursive:true,force:true});
  await rm(target,{recursive:true,force:true});
 }
}
await measure('history-heavy',60,50,0);
await measure('many-small',1000,5,0);
await measure('over-old-byte-limit',3,1,130*1024*1024);
console.log('PASS: backup load');
