import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {detectInstallMethod} from './detect.mjs';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheFile() {
  return path.join(os.homedir(), '.cache', 'atlas-docs', 'update-check.json');
}

export function updateCheckDisabled(env = process.env) {
  if (env.ATLAS_DOCS_NO_UPDATE_CHECK === '1' || env.ATLAS_DOCS_NO_UPDATE_CHECK === 'true') return true;
  if (env.CI === 'true' || env.CI === '1') return true;
  return false;
}

async function readCache() {
  try {
    return JSON.parse(await readFile(cacheFile(), 'utf8'));
  } catch {
    return null;
  }
}

async function writeCache(data) {
  const file = cacheFile();
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Fetch latest stable version from the npm registry. Never sends library paths.
 */
export async function fetchLatestVersion(packageName = 'atlas-docs', {timeoutMs = 2500} = {}) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
  const response = await fetch(url, {signal: AbortSignal.timeout(timeoutMs), headers: {accept: 'application/json'}});
  if (!response.ok) throw new Error(`Registry HTTP ${response.status}`);
  const body = await response.json();
  return {
    version: body.version,
    node: body.engines?.node || null,
  };
}

export function isNewerVersion(latest, current) {
  const parse = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

export async function checkForUpdate(packageRoot, currentVersion, {force = false, env = process.env} = {}) {
  const install = await detectInstallMethod(packageRoot);
  const packageName = install.packageName || 'atlas-docs';

  if (!force && updateCheckDisabled(env)) {
    return {skipped: true, reason: 'disabled', currentVersion, install};
  }

  if (!force) {
    const cached = await readCache();
    if (cached && cached.packageName === packageName && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
      return {
        skipped: false,
        cached: true,
        currentVersion,
        latestVersion: cached.latestVersion,
        nodeRequirement: cached.nodeRequirement,
        updateAvailable: isNewerVersion(cached.latestVersion, currentVersion),
        install,
      };
    }
  }

  try {
    const latest = await fetchLatestVersion(packageName);
    await writeCache({
      packageName,
      latestVersion: latest.version,
      nodeRequirement: latest.node,
      checkedAt: Date.now(),
    });
    return {
      skipped: false,
      cached: false,
      currentVersion,
      latestVersion: latest.version,
      nodeRequirement: latest.node,
      updateAvailable: isNewerVersion(latest.version, currentVersion),
      install,
    };
  } catch (error) {
    return {
      skipped: true,
      reason: 'network',
      error: error.message,
      currentVersion,
      install,
    };
  }
}

export function updateAdvice(install, latestVersion, packageName = 'atlas-docs') {
  const v = latestVersion || 'latest';
  switch (install.method) {
    case 'npm-global':
      return {
        canAuto: true,
        command: `npm install -g ${packageName}@${v}`,
        note: 'Stop Atlas Docs before updating. Uses the npm global prefix of this install.',
      };
    case 'npx':
      return {
        canAuto: false,
        command: `npx ${packageName}@${v}`,
        note: 'npx cache is not modified in place. Run the exact version above.',
      };
    case 'project':
      return {
        canAuto: false,
        command: null,
        note: 'This looks like a project dependency. Use the package manager and lockfile already in that project (for example npm/pnpm/yarn).',
      };
    case 'source':
      return {
        canAuto: false,
        command: null,
        note: 'Source checkout: pull or download the release, run npm run setup && npm run build, then npm start. Do not npm install -g.',
      };
    case 'docker':
      return {
        canAuto: false,
        command: null,
        note: 'Docker: rebuild/pull the image and recreate the container. Keep the same volume.',
      };
    default:
      return {
        canAuto: false,
        command: null,
        note: 'Could not detect the install method confidently. Update using the same method you used to install. Data libraries are not modified by package updates.',
      };
  }
}
