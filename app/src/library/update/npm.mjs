import {existsSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';

// Invoke npm through Node, including Windows where npm is a .cmd shim.
export function npmCli(env = process.env) {
  const candidates = [env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')];
  for (const directory of (env.PATH || env.Path || '').split(path.delimiter)) {
    candidates.push(path.join(directory, 'node_modules/npm/bin/npm-cli.js'));
    try { candidates.push(realpathSync(path.join(directory, 'npm'))); } catch {}
  }
  const found = candidates.find(file => file && /npm-cli\.js$/.test(file) && existsSync(file));
  if (!found) throw Error('Cannot locate npm-cli.js. Check your Node.js/npm installation.');
  return found;
}

export function npmOutput(args, options = {}) {
  return execFileSync(process.execPath, [npmCli(options.env), ...args], {encoding: 'utf8', windowsHide: true, timeout:3000, ...options}).trim();
}

export function runNpm(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli(options.env), ...args], {stdio: 'inherit', windowsHide: true, ...options});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error(`npm exited with code ${code}`)));
  });
}

export function stableVersion(value) {
  return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

export function nodeSatisfies(requirement, current = process.versions.node) {
  if (!requirement) return true;
  const m = /^>=\s*(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(requirement).trim());
  if (!m) return false;
  const actual = current.split('.').map(Number), needed = [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
  for (let i = 0; i < 3; i++) { if (actual[i] !== needed[i]) return actual[i] > needed[i]; }
  return true;
}
