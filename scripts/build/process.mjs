import {spawn} from 'node:child_process';
import path from 'node:path';
import {existsSync} from 'node:fs';

export function npmArgs(args) {
  const candidates = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')];
  const cli = candidates.find(file => file && /npm-cli\.js$/.test(file) && existsSync(file));
  if (!cli) throw Error('Cannot locate npm-cli.js. Run this script using npm run.');
  return [cli, ...args];
}

export async function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {stdio: 'inherit', windowsHide: true, ...options});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error(`Command failed (${code}): ${args.join(' ')}`)));
  });
}
