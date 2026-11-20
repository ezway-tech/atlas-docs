import '../helpers/environment.mjs';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initEmptyLibrary} from '../../../app/src/library/index.mjs';
import {loadTs} from '../helpers/load-ts.mjs';

const root = await mkdtemp(path.join(tmpdir(), 'atlas-reorder-')); // path used for DATA_DIR root
process.env.DATA_DIR = root;
try {
  await initEmptyLibrary(root);
  const store = await loadTs('src/lib/store.ts');
  const extras = await loadTs('src/lib/extras.ts');

  const a = await store.createFolder('', 'Alpha', null);
  const b = await store.createFolder('', 'Beta', null);
  const c = await store.createFolder('', 'Gamma', null);
  assert.equal(a, 'alpha');
  assert.equal(b, 'beta');
  assert.equal(c, 'gamma');

  await extras.reorder('', 'folders', [c, a, b]);
  const orders = (await store.readDB()).navigationOrder;
  assert.deepEqual(orders['folders:'], [c, a, b]);

  await assert.rejects(() => extras.reorder('', 'folders', [a, b]), /Order must contain all siblings|Invalid order/);
  await assert.rejects(() => extras.reorder('', 'folders', [a, b, c, 'missing']), /Order must contain all siblings|Invalid order/);
  await assert.rejects(() => extras.reorder('', 'folders', [a, a, b]), /Invalid order/);

  const docA = await store.createDoc(a, 'One', 'md');
  const docB = await store.createDoc(a, 'Two', 'md');
  await extras.reorder(a, 'docs', [docB.id, docA.id]);
  assert.deepEqual((await store.readDB()).navigationOrder[`docs:${a}`], [docB.id, docA.id]);
  await assert.rejects(() => extras.reorder(a, 'docs', [docA.id]), /Order must contain all siblings|Invalid order/);

  console.log('PASS: reorder accepts sibling permutations and rejects invalid sets');
} finally {
  await rm(root, {recursive: true, force: true});
}
