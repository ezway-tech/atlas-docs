import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadTs} from '../helpers/load-ts.mjs';

const {revealFolder, canRevealFolder} = await loadTs('src/lib/reveal-folder.ts');
const env = {ATLAS_LOCAL_DESKTOP: '1'};
const folder = 'Dự án có khoảng trắng';
for (const [platform, command] of Object.entries({win32:'explorer.exe', darwin:'open', linux:'xdg-open'})) {
  const desktop = {...env, WAYLAND_DISPLAY:'wayland-0'};
  assert.equal(canRevealFolder(platform, desktop), true);
  assert.equal(canRevealFolder(platform, {...desktop, ATLAS_DOCS_INSTALL:'docker'}), false);
  for (const result of [0, 1, 2, 'ENOENT']) {
    const run = revealFolder(folder, platform, (actual, args, options) => {
      assert.equal(actual, command);
      assert.deepEqual(args, [folder]);
      assert.equal(options.shell, false);
      const child = new EventEmitter();
      queueMicrotask(() => typeof result === 'number' ? child.emit('exit', result) : child.emit('error', Error(result)));
      return child;
    });
    if (result === 0 || (platform === 'win32' && result === 1)) await run;
    else await assert.rejects(run, typeof result === 'number' ? /failed/ : /ENOENT/);
  }
}
assert.equal(canRevealFolder('linux', env), false);
assert.equal(canRevealFolder('linux', {...env, DISPLAY:':0'}), true);
console.log('PASS: folder launch commands, outcomes and desktop availability');
