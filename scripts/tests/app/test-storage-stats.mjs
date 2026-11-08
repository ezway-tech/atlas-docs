import '../helpers/environment.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadTs} from '../helpers/load-ts.mjs';

const root=await mkdtemp(path.join(tmpdir(),'atlas-stats-'));
process.env.DATA_DIR=root;
try{
 const boot=spawnSync(process.execPath,['../scripts/setup/bootstrap.mjs'],{cwd:process.cwd(),env:{...process.env,DATA_DIR:root},encoding:'utf8'});
 assert.equal(boot.status,0,boot.stderr);
 await mkdir(path.join(root,'docs','topic'),{recursive:true});
 await writeFile(path.join(root,'docs','topic','note.md'),'hello stats');
 await mkdir(path.join(root,'history','topic','note'),{recursive:true});
 await writeFile(path.join(root,'history','topic','note','2026-01-01T00-00-00-000Z_123e4567-e89b-12d3-a456-426614174000.md'),'old');
 await writeFile(path.join(root,'history','topic','note','2026-01-01T00-00-00-000Z_123e4567-e89b-12d3-a456-426614174000.json'),'{}');
 await mkdir(path.join(root,'history','observed','topic'),{recursive:true});
 await writeFile(path.join(root,'history','observed','topic','note.md'),'mirror');
 await writeFile(path.join(root,'uploads','file.bin'),'xyz');
 await writeFile(path.join(root,'.odd.txt'),'odd');
 try{await symlink(path.join(root,'docs','topic','note.md'),path.join(root,'uploads','link.md'),'file');}catch{/* symlink may be blocked */}
 const {storageStats}=await loadTs('src/lib/storage-stats.ts');
 const stats=await storageStats(true);
 const groups=stats.documents.bytes+stats.history.bytes+stats.historyMeta.bytes+stats.observed.bytes+stats.attachments.bytes+stats.database.bytes;
 assert.equal(groups,stats.backupBytes);
 assert.equal(stats.backupFiles,stats.documents.files+stats.history.files+stats.historyMeta.files+stats.observed.files+stats.attachments.files+stats.database.files);
 assert.equal(stats.documents.bytes,Buffer.byteLength('hello stats'));
 assert.equal(stats.history.bytes,Buffer.byteLength('old'));
 assert.equal(stats.historyMeta.bytes,2);
 assert.equal(stats.observed.bytes,Buffer.byteLength('mirror'));
 assert.equal(stats.attachments.files,1);
 assert.ok(stats.unusual.some(item=>item.path==='.odd.txt'));
 assert.ok(stats.limits.maxDataFiles>=1);
 assert.ok(stats.warnings.every(item=>item.level==='warn'||item.level==='block'));
 console.log('PASS: storage stats');
}finally{await rm(root,{recursive:true,force:true});}
