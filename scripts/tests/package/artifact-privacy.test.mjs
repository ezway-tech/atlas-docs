import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {hasUserPath, neutralizeBuildRoot, assertPrivatePathFreeTarball} from '../../build/artifact-privacy.mjs';

test('detects home paths across platforms and escaping levels', () => {
  const paths = ['C:\\Users\\tester\\repo', 'D:/Users/tester/repo', '/Users/tester/repo', '/home/tester/repo'];
  for (const value of paths) {
    let encoded = value;
    for (let i = 0; i < 4; i++) {
      assert.equal(hasUserPath(encoded), true);
      encoded = JSON.stringify(encoded);
    }
  }
  assert.equal(hasUserPath('C:/atlas-build/atlas-docs/app'), false);
  assert.equal(hasUserPath('/atlas-build/atlas-docs/app'), false);
  assert.equal(hasUserPath('https://example.org/docs'), false);
});

test('sanitizes nested metadata without changing relative paths or unrelated values', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-privacy-'));
  try {
    await mkdir(path.join(dir, 'nested'));
    const root = 'C:\\Users\\tester\\repo';
    const input = {root, nested: JSON.stringify({file: root + '\\app\\page.js'}), relative: './app/page.js', version: '5.1.0'};
    const file = path.join(dir, 'nested', 'metadata.json');
    await writeFile(file, JSON.stringify(input));
    await neutralizeBuildRoot(dir, root);
    const result = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(result.root, 'C:/atlas-build/atlas-docs');
    assert.equal(JSON.parse(result.nested).file, 'C:/atlas-build/atlas-docs\\app\\page.js');
    assert.equal(result.relative, input.relative);
    assert.equal(result.version, input.version);
    const archive = path.join(dir, 'test.tgz');
    await writeFile(archive, gzipSync(JSON.stringify(input)));
    await assert.rejects(() => assertPrivatePathFreeTarball(archive), /Personal home path/);
    await writeFile(archive, gzipSync(JSON.stringify(result)));
    await assertPrivatePathFreeTarball(archive);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('browser selection is explicit and rejects invalid values', () => {
  const moduleUrl = new URL('../helpers/browser.mjs', import.meta.url).href;
  for (const value of [undefined, 'chromium', 'msedge', 'chrome', 'firefox', '']) {
    const env = {...process.env};
    delete env.ATLAS_TEST_BROWSER;
    if (value !== undefined) env.ATLAS_TEST_BROWSER = value;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import {browserOptions} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(browserOptions));`],
    {env, encoding: 'utf8', windowsHide: true});
    if (value === 'firefox' || value === '') {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Invalid ATLAS_TEST_BROWSER/);
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        headless: true,
        ...(['msedge', 'chrome'].includes(value) ? {channel: value} : {}),
      });
    }
  }
});
