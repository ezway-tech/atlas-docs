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
  assert.equal(folderTitleFromSlug('00-start'), '00 Start');
  assert.equal(folderTitleFromSlug('api-v2'), 'Api V2');
  assert.equal(folderTitleFromSlug('start'), 'Start');
  assert.equal(folderTitleFromSlug('my_folder'), 'My Folder');
  assert.equal(folderTitleFromSlug('a/b/00-start'), '00 Start');
  assert.equal(folderTitleFromSlug('guides/api-v2'), 'Api V2');
  console.log('PASS: folderTitleFromSlug humanizes kebab/underscore without stripping separators');
} finally {
  await rm(root, {recursive: true, force: true});
}
