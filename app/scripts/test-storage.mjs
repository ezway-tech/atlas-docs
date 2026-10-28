import {mkdir,mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=await mkdtemp(path.join(tmpdir(),'atlas-full-source-test-'));
try{
 const cmd=()=>{const r=spawnSync(process.execPath,['scripts/bootstrap.mjs'],{cwd:process.cwd(),env:{...process.env,DATA_DIR:root},encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 cmd();assert.deepEqual(await readdir(path.join(root,'docs')),[]);
 const filename=path.join(root,'docs','test.md');const dbFile=path.join(root,'db.json');
 await writeFile(filename,'# My own content');const custom=await readFile(dbFile,'utf8');
 cmd();assert.equal(await readFile(dbFile,'utf8'),custom);assert.equal(await readFile(filename,'utf8'),'# My own content');
 console.log('PASS: empty bootstrap and no data overwrite');
}finally{await rm(root,{recursive:true,force:true});}
