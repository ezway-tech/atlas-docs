import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {access, constants, link, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile} from 'node:fs/promises';
import {emptyDatabase} from './schema.mjs';

export const folderLayout = 'atlas-folder-v1';
const controlFiles = new Set(['db.json', 'node_modules', '.git']);
const documentExtensions = new Set(['.md', '.markdown', '.json', '.yaml', '.yml', '.sql']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const ignored = name => name.startsWith('.') || name.toLowerCase() === 'node_modules';
const supported = name => documentExtensions.has(path.extname(name).toLowerCase());

async function checkedPath(root, relative) {
  const parts = relative.split('/');
  if (!relative || parts.some(name => !name || ignored(name) || /[\\:\x00]/.test(name)) ||
      controlFiles.has(parts[0].toLowerCase())) throw Error('Invalid document path.');
  const target = path.join(root, ...parts);
  if (await realpath(target) !== target || !(await lstat(target)).isFile()) throw Error('Choose a regular file inside this project.');
  return target;
}

export async function listFolderFiles(root) {
  const files = [], unreadable = [];
  async function walk(directory, prefix) {
    let entries;
    try { entries = await readdir(directory, {withFileTypes:true}); }
    catch { unreadable.push(prefix); return; }
    for (const entry of entries) {
      if (ignored(entry.name) || entry.isSymbolicLink() || (!prefix && controlFiles.has(entry.name.toLowerCase()))) continue;
      const key = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), key);
      else if (entry.isFile()) files.push({path:key, supported:supported(entry.name)});
    }
  }
  await walk(root, '');
  return {files, unreadable};
}

export async function readFolderDocument(root, relative) {
  if (!supported(relative)) throw Error('Preview unavailable for this file type.');
  const target = await checkedPath(root, relative);
  if ((await lstat(target)).size > 16*1024*1024) throw Error('This document exceeds the 16 MiB preview limit.');
  const data = await readFile(target);
  return {raw:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data), version:digest(data)};
}

// Called under the project lock. Publish complete metadata without overwriting another file.
export async function initializeFolder(root) {
  const temp = path.join(root, '.atlas-init-' + randomUUID());
  try {
    await writeFile(temp, JSON.stringify({...emptyDatabase(2), layout:folderLayout}, null, 2), {flag:'wx'});
    await link(temp, path.join(root,'db.json'));
  } finally { await rm(temp,{force:true}); }
}

export async function saveFolderDocument(root, relative, raw, version) {
  const target = await checkedPath(root, relative);
  await access(target,constants.W_OK);
  const current = await readFolderDocument(root, relative);
  if (current.version !== version) return {conflict:true,...current};
  if (raw === current.raw) return current;
  const folder = path.join(root, '.atlas-folder-history');
  for (const dir of [folder,path.join(folder,digest(relative))]) {
    try {await mkdir(dir);} catch (error) {if (error.code !== 'EEXIST') throw error;}
    if (await realpath(dir) !== dir || !(await lstat(dir)).isDirectory()) throw Error('Invalid project history directory.');
  }
  const tmp = path.join(path.dirname(target), '.atlas-edit-' + randomUUID());
  try {
    await writeFile(tmp,raw,{flag:'wx',mode:(await lstat(target)).mode});
    const latest = await readFolderDocument(root,relative);
    if (latest.version !== version) return {conflict:true,...latest};
    await writeFile(path.join(folder,digest(relative),Date.now()+'-'+randomUUID()+'.json'),JSON.stringify({path:relative,...current}),{flag:'wx'});
    await rename(tmp,target);
  } finally {await rm(tmp,{force:true});}
  return {raw,version:digest(raw)};
}

export async function folderRevisions(root, relative) {
  await checkedPath(root,relative);
  const dir=path.join(root,'.atlas-folder-history',digest(relative));
  let names;
  try {
    if (await realpath(dir)!==dir) throw Error('Invalid project history directory.');
    names=await readdir(dir,{withFileTypes:true});
  } catch(error) {if(error.code==='ENOENT')return [];throw error;}
  return names.filter(entry=>entry.isFile() && /^\d{13}-[\da-f-]{36}\.json$/.test(entry.name))
    .map(entry=>entry.name).sort().reverse();
}

export async function folderRevision(root,relative,id) {
  if (!(await folderRevisions(root,relative)).includes(id)) throw Error('Revision not found.');
  const file=path.join(root,'.atlas-folder-history',digest(relative),id);
  if(await realpath(file)!==file)throw Error('Invalid revision file.');
  const entry=JSON.parse(await readFile(file,'utf8'));
  if(entry.path!==relative || typeof entry.raw!=='string' || digest(entry.raw)!==entry.version)throw Error('Invalid revision content.');
  return entry;
}
