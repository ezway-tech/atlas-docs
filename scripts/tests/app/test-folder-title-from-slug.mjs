import '../helpers/environment.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadTs} from '../helpers/load-ts.mjs';

const root = await mkdtemp(path.join(tmpdir(), 'atlas-folder-title-'));
process.env.DATA_DIR = root;
try {
  const {folderTitleFromSlug} = await loadTs('src/lib/store.ts');
  assert.equal(folderTitleFromSlug('00-start'), '00-start');
  assert.equal(folderTitleFromSlug('api-v2'), 'api-v2');
  assert.equal(folderTitleFromSlug('start'), 'start');
  assert.equal(folderTitleFromSlug('my_folder'), 'my_folder');
  assert.equal(folderTitleFromSlug('a/b/00-start'), '00-start');
  assert.equal(folderTitleFromSlug('guides/api-v2'), 'api-v2');
  console.log('PASS: folderTitleFromSlug keeps basename slug as-is');
} finally {
  await rm(root, {recursive: true, force: true});
}
