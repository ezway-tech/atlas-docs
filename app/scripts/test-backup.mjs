import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {loadTs} from './load-ts.mjs';

const app=process.cwd();
if(process.argv[2]==='import'||process.argv[2]==='fail'){
 process.env.DATA_DIR=process.argv[3];
 const mod=await loadTs('src/lib/backup.ts');
 const journal=await loadTs('src/lib/import-journal.ts');
 const limits=process.argv[5]?JSON.parse(process.argv[5]):undefined;
 if(process.argv[2]==='fail'){
  const dbFile=path.join(process.argv[3],'db.json');
  const before=await readFile(dbFile);
  await assert.rejects(()=>mod.importZip(process.argv[4],{deleteZip:false,limits,failAfterCommits:1,leaveJournal:true}),/interrupted/);
  await journal.recoverInterruptedImport();
  assert.deepEqual(await readFile(dbFile),before);
  assert.deepEqual(await readdir(path.join(process.argv[3],'docs')),[]);
  console.log(JSON.stringify({ok:true}));
  process.exit(0);
 }
 const result=await mod.importZip(process.argv[4],{deleteZip:false,...(limits?{limits}:{})});
 console.log(JSON.stringify(result));
 process.exit(0);
}

const root=await mkdtemp(path.join(tmpdir(),'atlas-backup-'));
const other=await mkdtemp(path.join(tmpdir(),'atlas-backup-restore-'));
const outside=await mkdtemp(path.join(tmpdir(),'atlas-backup-outside-'));
const zips=await mkdtemp(path.join(tmpdir(),'atlas-backup-zips-'));
process.env.DATA_DIR=root;
const boot=(dir)=>{const r=spawnSync(process.execPath,['scripts/bootstrap.mjs'],{cwd:app,env:{...process.env,DATA_DIR:dir},encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
boot(root);boot(other);
const backup=await loadTs('src/lib/backup.ts');
const store=await loadTs('src/lib/store.ts');
const huge={maxUncompressedBytes:1024*1024*1024,maxZipBytes:1024*1024*1024,maxDataFiles:100000};
const sha=(bytes)=>createHash('sha256').update(bytes).digest('hex');
async function filesOf(dir,prefix=''){const out=[];let entries=[];try{entries=await readdir(dir,{withFileTypes:true});}catch{return out;}for(const entry of entries){if(entry.name.startsWith('.'))continue;const abs=path.join(dir,entry.name),rel=prefix?prefix+'/'+entry.name:entry.name;if(entry.isDirectory())out.push(...await filesOf(abs,rel));else out.push(rel);}return out.sort();}
async function snapshot(dir){const names=await filesOf(dir);const body={};for(const name of names)body[name]=sha(await readFile(path.join(dir,name)));return body;}
function saveZip(name,entries){const file=path.join(zips,name);return writeFile(file,zipSync(entries)).then(()=>file);}
function childImport(dir,zip,limits){const r=spawnSync(process.execPath,['--experimental-strip-types','scripts/test-backup.mjs','import',dir,zip,limits?JSON.stringify(limits):''],{cwd:app,env:{...process.env,DATA_DIR:dir},encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);return JSON.parse(r.stdout);}

try{
 const before=await snapshot(root);
 const db=strToU8(await readFile(path.join(root,'db.json')));
 const manifest=(files)=>({format:'atlas-docs',version:1,createdAt:'2026-01-01T00:00:00.000Z',files});
 const goodFiles={'db.json':db};
 const good=manifest({ 'db.json':sha(db) });
 await assert.rejects(async()=>backup.importZip(await saveZip('short.zip',{}),{deleteZip:false,limits:huge}),/ZIP hỏng|Không phải bản sao lưu|corrupt|Not an Atlas/);
 assert.deepEqual(await snapshot(root),before);
 await assert.rejects(async()=>backup.importZip(await saveZip('bad-manifest.zip',{'db.json':db,'atlas-manifest.json':strToU8('{"format":"nope","version":1,"files":{}}')}),{deleteZip:false,limits:huge}),/Không phải bản sao lưu|Not an Atlas/);
 await assert.rejects(async()=>backup.importZip(await saveZip('checksum.zip',{'db.json':db,'atlas-manifest.json':strToU8(JSON.stringify(manifest({'db.json':'00'})))}),{deleteZip:false,limits:huge}),/Checksum/);
 await assert.rejects(async()=>backup.importZip(await saveZip('extra.zip',{'db.json':db,'docs/a.md':strToU8('x'),'atlas-manifest.json':strToU8(JSON.stringify(good))}),{deleteZip:false,limits:huge}),/không khớp manifest|does not match the manifest/);
 await assert.rejects(async()=>backup.importZip(await saveZip('missing.zip',{'atlas-manifest.json':strToU8(JSON.stringify(good))}),{deleteZip:false,limits:huge}),/không khớp manifest|Không phải bản sao lưu|Not an Atlas|does not match the manifest/);
 await assert.rejects(async()=>backup.importZip(await saveZip('escape.zip',{'../outside.txt':strToU8('nope'),'atlas-manifest.json':strToU8('{}')}),{deleteZip:false,limits:huge}),/Đường dẫn không an toàn|Không phải bản sao lưu|ZIP hỏng|Unsafe path|Not an Atlas|corrupt/);
 assert.deepEqual(await snapshot(root),before);
 assert.equal(await readdir(outside).then(names=>names.length),0);
 const valid=await saveZip('valid.zip',{...goodFiles,'atlas-manifest.json':strToU8(JSON.stringify(good))});
 const truncated=path.join(zips,'cut.zip');
 const whole=await readFile(valid);
 await writeFile(truncated,whole.subarray(0,Math.max(8,Math.floor(whole.length/2))));
 await assert.rejects(()=>backup.importZip(truncated,{deleteZip:false,limits:huge}),/ZIP hỏng|Không phải bản sao lưu|Checksum|corrupt|Not an Atlas/);
 assert.deepEqual(await snapshot(root),before);

 await store.createFolder('','Notes',null);
 await store.createDoc('notes','Hello');
 await store.saveDoc('notes/hello','---\ntitle: "Hello"\n---\n\n# Hello\n');
 const listed=await backup.listDataFiles(root);
 const bytes=listed.reduce((sum,file)=>sum+file.size,0);
 await assert.rejects(()=>backup.exportZip({limits:{...huge,maxDataFiles:listed.length-1}}),/tệp dữ liệu|Too many data files|data files/i);
 await assert.rejects(()=>backup.exportZip({limits:{...huge,maxUncompressedBytes:bytes-1}}),/chưa nén|Uncompressed|uncompressed/i);
 await assert.rejects(()=>backup.exportZip({limits:{...huge,maxZipBytes:1}}),/ZIP/i);
 const exported=await backup.exportZip({limits:{...huge,maxDataFiles:listed.length,maxUncompressedBytes:bytes}});
 assert.equal(exported.files,listed.length);
 const zipCopy=path.join(zips,'round.zip');
 await writeFile(zipCopy,await readFile(exported.file));
 await exported.cleanup();
 const imported=childImport(other,zipCopy,huge);
 assert.equal(imported.ok,true);
 assert.deepEqual(await snapshot(other),await snapshot(root));
 const opened=unzipSync(await readFile(zipCopy));
 assert.equal(Object.keys(opened).filter(name=>name.endsWith('/')).length,0);
 assert.ok(opened['atlas-manifest.json']);
 const back=await backup.importZip(zipCopy,{deleteZip:false,limits:huge}).catch(e=>e);
 assert.match(String(back),/empty data|empty library/i);
 assert.deepEqual(await snapshot(root),await snapshot(other));

 const changed=await assert.rejects(()=>backup.exportZip({duringSnapshot:async()=>{await writeFile(path.join(root,'docs','notes','hello.md'),'changed while exporting');}}));
 assert.equal(changed,undefined);
 assert.match(await readFile(path.join(root,'docs','notes','hello.md'),'utf8'),/changed while exporting/);
 await store.saveDoc('notes/hello','---\ntitle: "Hello"\n---\n\n# Hello again\n');

 const fresh=await mkdtemp(path.join(tmpdir(),'atlas-backup-interrupt-'));
 boot(fresh);
 const failed=spawnSync(process.execPath,['--experimental-strip-types','scripts/test-backup.mjs','fail',fresh,zipCopy,JSON.stringify(huge)],{cwd:app,env:{...process.env,DATA_DIR:fresh},encoding:'utf8'});
 assert.equal(failed.status,0,failed.stderr||failed.stdout);
 console.log('PASS: backup policy and safe import');
}finally{
 await rm(root,{recursive:true,force:true});
 await rm(other,{recursive:true,force:true});
 await rm(outside,{recursive:true,force:true});
 await rm(zips,{recursive:true,force:true});
}
