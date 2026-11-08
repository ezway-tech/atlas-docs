import '../helpers/environment.mjs';
import {appRequire} from '../../dependencies.mjs';
import {mkdir,mkdtemp,readFile,writeFile,readdir,rm,cp} from 'node:fs/promises';
import {seedDemo,demoRoot,validateDemo,sampleFiles} from '../../setup/seed-demo.mjs';
const {parse} = appRequire('yaml');
const sqlParser = appRequire('node-sql-parser');
import {tmpdir} from 'node:os';
import path from 'node:path';import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=await mkdtemp(path.join(tmpdir(),'atlas-full-source-test-'));
try{
 const cmd=()=>{const r=spawnSync(process.execPath,['../scripts/setup/bootstrap.mjs'],{cwd:process.cwd(),env:{...process.env,DATA_DIR:root},encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 cmd();assert.deepEqual(await readdir(path.join(root,'docs')),[]);
 const filename=path.join(root,'docs','test.md');const dbFile=path.join(root,'db.json');
 await writeFile(filename,'# My own content');const custom=await readFile(dbFile,'utf8');
 cmd();assert.equal(await readFile(dbFile,'utf8'),custom);assert.equal(await readFile(filename,'utf8'),'# My own content');
 console.log('PASS: empty bootstrap and no data overwrite');
 const cases=await mkdtemp(path.join(tmpdir(),'atlas-demo-storage-'));
 try{
  await validateDemo(demoRoot);
  const api=parse(await readFile(path.join(demoRoot,'docs/ordering/openapi.yml'),'utf8'));
  assert.equal(api.openapi,'3.0.3');assert.ok(api.paths['/orders'].post);
  const config=parse(await readFile(path.join(demoRoot,'docs/ordering/cafe.yml'),'utf8'));
  assert.equal(config.cafe.name,'Little Café');
  new sqlParser.Parser().astify(await readFile(path.join(demoRoot,'docs/ordering/schema.sql'),'utf8'));
  const overview=await readFile(path.join(demoRoot,'docs/ordering/overview.md'),'utf8');
  for(const [lang,file] of [['sql','schema.sql'],['yaml','openapi.yml']]){
   const block=overview.match(new RegExp('```'+lang+'\\r?\\n([\\s\\S]*?)```'));
   assert.ok(block,'Missing embedded '+lang);
   assert.equal(block[1].trim(),(await readFile(path.join(demoRoot,'docs/ordering',file),'utf8')).trim());
  }
  const target=path.join(cases,'fresh');await seedDemo(target);
  for(const f of await sampleFiles(demoRoot))assert.deepEqual(await readFile(path.join(target,f)),await readFile(path.join(demoRoot,f)));
  await assert.rejects(()=>seedDemo(target),/not empty/);
  for(const kind of ['docs','uploads','history','folders','assets','comments','invalid-db','unknown']){
   const dir=path.join(cases,kind);await mkdir(dir);
   const db={folders:[],assets:[],comments:[]};
   if(['folders','assets','comments'].includes(kind))db[kind].push({id:'existing'});
   await writeFile(path.join(dir,'db.json'),kind==='invalid-db'?'broken':JSON.stringify(db));
   if(['docs','uploads','history'].includes(kind)){await mkdir(path.join(dir,kind));await writeFile(path.join(dir,kind,'keep'),'user data');}
   if(kind==='unknown')await writeFile(path.join(dir,'keep.txt'),'user data');
   const before=await Promise.all((await sampleFiles(dir)).map(async f=>[f,await readFile(path.join(dir,f),'utf8')]));
   await assert.rejects(()=>seedDemo(dir));
   const after=await Promise.all((await sampleFiles(dir)).map(async f=>[f,await readFile(path.join(dir,f),'utf8')]));assert.deepEqual(after,before);
  }
  const empty=path.join(cases,'bootstrapped');
  const boot=spawnSync(process.execPath,['../scripts/setup/bootstrap.mjs'],{env:{...process.env,DATA_DIR:empty},encoding:'utf8'});assert.equal(boot.status,0,boot.stderr);
  const original=await readFile(path.join(empty,'db.json'),'utf8');
  await assert.rejects(()=>seedDemo(empty,path.join(cases,'missing')));
  assert.equal(await readFile(path.join(empty,'db.json'),'utf8'),original);
  const invalid=path.join(cases,'invalid-sample');await cp(demoRoot,invalid,{recursive:true});
  await writeFile(path.join(invalid,'docs/start/welcome.md'),'[broken](missing.md)');
  await assert.rejects(()=>seedDemo(empty,invalid),/Broken demo link/);
  assert.equal(await readFile(path.join(empty,'db.json'),'utf8'),original);
  assert.deepEqual(await readdir(path.join(empty,'docs')),[]);
  await writeFile(path.join(invalid,'docs/start/welcome.md'),'Missing recipe: [[menu/missing]]');
  await assert.rejects(()=>seedDemo(empty,invalid),/Broken demo wiki link/);
  assert.equal(await readFile(path.join(empty,'db.json'),'utf8'),original);
  assert.deepEqual(await readdir(path.join(empty,'docs')),[]);
  await writeFile(path.join(empty,'AGENTS.md'),'Personal library instructions');
  await mkdir(path.join(empty,'.atlas'));
  await writeFile(path.join(empty,'.atlas','guide.md'),'Managed reference');
  await seedDemo(empty);
  assert.equal(await readFile(path.join(empty,'AGENTS.md'),'utf8'),'Personal library instructions');
  assert.equal(await readFile(path.join(empty,'.atlas','guide.md'),'utf8'),'Managed reference');
  const seeded=await readFile(path.join(empty,'db.json'),'utf8');
  const repeat=spawnSync(process.execPath,['../scripts/setup/bootstrap.mjs'],{env:{...process.env,DATA_DIR:empty},encoding:'utf8'});assert.equal(repeat.status,0,repeat.stderr);
  assert.equal(await readFile(path.join(empty,'db.json'),'utf8'),seeded);
  console.log('PASS: demo syntax, references, copy, existing-data guards, missing/invalid sample, bootstrap after seed');
 }finally{await rm(cases,{recursive:true,force:true});}
}finally{await rm(root,{recursive:true,force:true});}
