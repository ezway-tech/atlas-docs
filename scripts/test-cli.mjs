import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {parseOptions} from '../cli/options.mjs';
import {installAgentKit} from '../cli/init-library.mjs';

test('options resolve caller paths, precedence, and invalid input', () => {
  const cwd = path.resolve('some project');
  assert.equal(parseOptions([], {}, cwd).dataDir, path.join(cwd, 'atlas-docs-data'));
  assert.equal(parseOptions([], {DATA_DIR: 'env'}, cwd).dataDir, path.join(cwd, 'env'));
  const chosen = parseOptions(['--data-dir', 'tài liệu', '--port', '3200', '--no-open'], {DATA_DIR: 'env'}, cwd);
  assert.equal(chosen.dataDir, path.join(cwd, 'tài liệu'));
  assert.equal(chosen.port, 3200); assert.equal(chosen.open, false);
  for (const args of [['--port', '0'], ['--port', '65536'], ['--port', '1.2'], ['--port'], ['--data-dir'], ['--bad']]) assert.throws(() => parseOptions(args));
});

test('guide upgrades preserve personal rules, edited guides and unknown files', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'atlas-guide-test-'));
  try {
    const kit = path.join(temp, 'kit'), library = path.join(temp, 'library');
    await mkdir(path.join(kit, 'guides'), {recursive: true});
    const writeKit = async (version, content) => {
      await writeFile(path.join(kit, 'guides/test.md'), content);
      await writeFile(path.join(kit, 'library-AGENTS.md'), 'standard instructions');
      await writeFile(path.join(kit, 'manifest.json'), JSON.stringify({version, files: {'guides/test.md': createHash('sha256').update(content).digest('hex')}}));
    };
    await writeKit('1', 'original');
    await installAgentKit(library, kit, () => {});
    await writeFile(path.join(library, 'AGENTS.md'), 'personal rules');
    await writeFile(path.join(library, '.atlas/guides/test.md'), 'my changes');
    await writeFile(path.join(library, '.atlas/custom.txt'), 'custom');
    await writeKit('2', 'updated');
    await installAgentKit(library, kit, () => {});
    assert.equal(await readFile(path.join(library, 'AGENTS.md'), 'utf8'), 'personal rules');
    assert.equal(await readFile(path.join(library, '.atlas/guides/test.md'), 'utf8'), 'updated');
    assert.equal(await readFile(path.join(library, '.atlas/custom.txt'), 'utf8'), 'custom');
    const backups = await readdir(path.join(library, '.atlas/backups'));
    assert.equal(backups.length, 1);
    assert.equal(await readFile(path.join(library, '.atlas/backups', backups[0], 'guides/test.md'), 'utf8'), 'my changes');
    await installAgentKit(library, kit, () => {});
    assert.equal((await readdir(path.join(library, '.atlas/backups'))).length, 1);
    await writeFile(path.join(kit, 'manifest.json'), JSON.stringify({files: {'../escape': 'bad'}}));
    await assert.rejects(() => installAgentKit(library, kit), /Invalid agent-kit path/);
  } finally { await rm(temp, {recursive: true, force: true}); }
});

test('managed directory links cannot redirect writes', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'atlas-guide-link-'));
  try {
    await mkdir(path.join(temp, 'library'));
    await mkdir(path.join(temp, 'outside'));
    await mkdir(path.join(temp, 'kit'));
    await writeFile(path.join(temp, 'kit/manifest.json'), '{"files":{}}');
    await symlink(path.join(temp, 'outside'), path.join(temp, 'library/.atlas'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(() => installAgentKit(path.join(temp, 'library'), path.join(temp, 'kit')), /symbolic link/);
    assert.deepEqual(await readdir(path.join(temp, 'outside')), []);
  } finally { await rm(temp, {recursive: true, force: true}); }
});
