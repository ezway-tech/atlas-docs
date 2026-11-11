import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {npmOutput} from './npm.mjs';
import {canonicalize} from '../paths.mjs';

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort install method detection. Returns null fields when uncertain — callers must not guess.
 */
export async function detectInstallMethod(packageRoot, env = process.env) {
  const root = path.resolve(packageRoot);
  let pkg;
  try {
    pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  } catch {
    return {method: 'unknown', packageRoot: root};
  }

  const name = pkg.name || 'atlas-docs';

  // Both repository root and the app/ working directory identify a checkout.
  if (pkg.private && (await exists(path.join(root, 'src/library/index.mjs')) || await exists(path.join(root, 'app/src/library/index.mjs')))) {
    return {method: 'source', packageRoot: root, packageName: 'atlas-docs'};
  }
  if (env.ATLAS_DOCS_INSTALL === 'docker' || env.DATA_DIR === '/data' && await exists('/.dockerenv')) {
    return {method: 'docker', packageRoot: root, packageName: name};
  }

  // Global: this package lives under a node_modules and argv[1] points here
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  const nm = `${path.sep}node_modules${path.sep}${name}`;
  if (entry.includes(nm) || root.includes(nm)) {
    // npx often uses a cache path containing _npx
    if (root.includes(`${path.sep}_npx${path.sep}`) || root.includes(`${path.sep}.npm${path.sep}`) && root.includes('_npx')) {
      return {method: 'npx', packageRoot: root, packageName: name};
    }
    // Project dependency: local node_modules not in global prefix
    try {
      const globalRoot = npmOutput(['root', '-g'], {env});
      if (globalRoot && canonicalize(root) === canonicalize(path.join(globalRoot, name))) {
        const globalPrefix = npmOutput(['prefix', '-g'], {env});
        return {method: 'npm-global', packageRoot: root, packageName: name, globalRoot, globalPrefix};
      }
    } catch {
      // leave unknown-ish
    }
    if (root.includes(`${path.sep}node_modules${path.sep}`)) {
      return {method: 'project', packageRoot: root, packageName: name};
    }
  }

  if (await exists(path.join(root, 'runtime', 'server.js'))) {
    // Packaged install without clear global/npx markers
    return {method: 'npm-package', packageRoot: root, packageName: name};
  }

  return {method: 'unknown', packageRoot: root, packageName: name};
}
