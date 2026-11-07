import {mkdir, readFile, writeFile, lstat, copyFile, rename} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function readOptional(file) {
  try { return await readFile(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Refuse links in managed paths so an upgrade cannot overwrite files outside the library.
async function safePath(root, relative) {
  if (!relative || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative)) throw Error('Invalid agent-kit path');
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw Error(`Managed path must not be a symbolic link: ${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return current;
}

export async function installAgentKit(root, kit, log = console.log) {
  await mkdir(root, {recursive: true});
  const manifest = JSON.parse(await readFile(path.join(kit, 'manifest.json'), 'utf8'));
  const stateFile = await safePath(root, '.atlas/manifest.json');
  const previousBytes = await readOptional(stateFile);
  let previous = {files: {}};
  if (previousBytes) {
    try { previous = JSON.parse(previousBytes); } catch { throw Error(`Invalid agent-kit manifest: ${stateFile}. Preserve it and move it aside before retrying.`); }
  }
  const backupId = `${Date.now()}-${randomUUID()}`;
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const source = await safePath(kit, relative);
    const bytes = await readFile(source);
    if (hash(bytes) !== expected) throw Error(`Agent-kit checksum mismatch: ${relative}`);
    const target = await safePath(root, `.atlas/${relative}`);
    const current = await readOptional(target);
    if (current && hash(current) === expected) continue;
    if (current && hash(current) !== previous.files?.[relative]) {
      const backup = await safePath(root, `.atlas/backups/${backupId}/${relative}`);
      await mkdir(path.dirname(backup), {recursive: true});
      await copyFile(target, backup);
      log(`[Atlas Docs] Preserved edited guide: ${backup}`);
    }
    await mkdir(path.dirname(target), {recursive: true});
    const pending = `${target}.${randomUUID()}.tmp`;
    await writeFile(pending, bytes, {flag: 'wx'});
    await rename(pending, target);
  }
  await mkdir(path.dirname(stateFile), {recursive: true});
  const pendingState = `${stateFile}.${randomUUID()}.tmp`;
  await writeFile(pendingState, JSON.stringify(manifest, null, 2), {flag: 'wx'});
  await rename(pendingState, stateFile);
  const agents = await safePath(root, 'AGENTS.md');
  const template = await readFile(path.join(kit, 'library-AGENTS.md'));
  try { await writeFile(agents, template, {flag: 'wx'}); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await readFile(agents)).equals(template)) log(`[Atlas Docs] Kept existing AGENTS.md. Add a link to ${path.join(root, '.atlas/guides/agent-guide.md')}`);
  }
}
