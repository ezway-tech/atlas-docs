import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm,rename} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareLibrary} from '../../../app/src/library/prepare.mjs';
import {listFolderFiles, readFolderDocument, saveFolderDocument} from '../../../app/src/library/folder-project.mjs';
test('in-place documents preserve paths and revisions across project moves',async()=>{
  const parent=await mkdtemp(path.join(os.tmpdir(),'atlas-in-place-'));
  let root=path.join(parent,'original');
  try{
    const relative='Bài học/a/b/c/d.v1/Latte.MD';
    await mkdir(path.dirname(path.join(root,relative)),{recursive:true});
    await writeFile(path.join(root,relative),'first');
    await writeFile(path.join(root,'README.md'),'home');
    await writeFile(path.join(root,'AGENTS.md'),'personal');
    await writeFile(path.join(root,'setup.py'),'source');
    await prepareLibrary({libraryRoot:root,holdLock:false});
    assert.equal(JSON.parse(await readFile(path.join(root,'db.json'))).layout,'atlas-folder-v1');
    const {files}=await listFolderFiles(root);
    assert.ok(files.find(f=>f.path===relative)?.supported);
    assert.equal(files.find(f=>f.path==='setup.py').supported,false);
    assert.ok(files.some(f=>f.path==='README.md'));
    const original=await readFolderDocument(root,relative);
    await writeFile(path.join(root,relative),'external');
    assert.equal((await saveFolderDocument(root,relative,'my draft',original.version)).conflict,true);
    const current=await readFolderDocument(root,relative);
    await saveFolderDocument(root,relative,'my draft',current.version);
    await assert.rejects(readFolderDocument(root,'../escape.md'));
    await assert.rejects(readFolderDocument(root,'db.json'));
    const moved=path.join(parent,'moved');
    await rename(root,moved);root=moved;
    await prepareLibrary({libraryRoot:root,holdLock:false});
    assert.equal((await readFolderDocument(root,relative)).raw,'my draft');
    assert.equal(await readFile(path.join(root,'AGENTS.md'),'utf8'),'personal');
    assert.equal((await readdir(path.join(root,'.atlas-folder-history'))).length,1);
  }finally{await rm(parent,{recursive:true,force:true});}
});
test('foreign metadata opens read only without writes',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'atlas-foreign-'));
  try{
    await writeFile(path.join(root,'db.json'),'{"app":"other"}');
    assert.equal((await prepareLibrary({libraryRoot:root,holdLock:false})).readOnly,true);
    assert.deepEqual(await readdir(root),['db.json']);
    assert.equal(await readFile(path.join(root,'db.json'),'utf8'),'{"app":"other"}');
  }finally{await rm(root,{recursive:true,force:true});}
});
