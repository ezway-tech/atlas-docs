import {spawn} from 'node:child_process';
import {checkForUpdate, updateAdvice, isNewerVersion} from '../../core/update/check.mjs';
import {detectInstallMethod} from '../../core/update/detect.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, {stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true});
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve() : reject(Error(`npm exited with code ${code}`))));
  });
}

function nodeSatisfies(requirement, current = process.versions.node) {
  if (!requirement) return true;
  // Only handle forms like ">=22.12.0"
  const m = String(requirement).match(/>=\s*(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return true;
  const [maj, min, pat] = current.split('.').map(Number);
  const need = [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
  if (maj !== need[0]) return maj > need[0];
  if (min !== need[1]) return min > need[1];
  return (pat || 0) >= need[2];
}

export async function runUpdate(packageRoot, options, manifest) {
  const result = await checkForUpdate(packageRoot, manifest.version, {force: true});
  const advice = updateAdvice(result.install, result.latestVersion, result.install.packageName || 'atlas-docs');

  console.log(`Running version:  ${result.currentVersion}`);
  if (result.latestVersion) console.log(`Latest stable:    ${result.latestVersion}`);
  else console.log(`Latest stable:    (unavailable${result.error ? `: ${result.error}` : ''})`);
  console.log(`Install method:   ${result.install.method}`);
  if (advice.command) console.log(`Suggested command:${advice.command}`);
  console.log(advice.note);

  if (options.updateCheck) return;

  if (!result.latestVersion) {
    throw Error('Cannot update: latest version could not be determined. Library data was not changed.');
  }
  if (!isNewerVersion(result.latestVersion, result.currentVersion)) {
    console.log('[Atlas Docs] Already on the latest stable version.');
    return;
  }
  if (result.nodeRequirement && !nodeSatisfies(result.nodeRequirement)) {
    throw Error(
      `Latest version requires Node.js ${result.nodeRequirement}; this runtime is ${process.versions.node}. Library data was not changed.`,
    );
  }

  if (!advice.canAuto || !advice.command) {
    console.log('[Atlas Docs] Automatic update is not available for this install method.');
    console.log('[Atlas Docs] Library data was not changed.');
    process.exitCode = 1;
    return;
  }

  if (result.install.method === 'npm-global') {
    console.log('[Atlas Docs] Stop any running Atlas Docs server before continuing.');
    // Install exact version; do not invent a different npm binary.
    const name = result.install.packageName || 'atlas-docs';
    await runNpm(['install', '-g', `${name}@${result.latestVersion}`]);
    // Verify by reading global package if possible
    try {
      const {execFileSync} = await import('node:child_process');
      const listed = execFileSync('npm', ['list', '-g', name, '--depth', '0', '--json'], {encoding: 'utf8'});
      const json = JSON.parse(listed);
      const ver = json?.dependencies?.[name]?.version;
      if (ver !== result.latestVersion) {
        throw Error(`Update finished but npm reports version ${ver || 'unknown'}, expected ${result.latestVersion}.`);
      }
      console.log(`[Atlas Docs] Updated to ${ver}. Start the app again with: atlas-docs`);
    } catch (error) {
      if (error.message?.includes('expected')) throw error;
      console.log(`[Atlas Docs] npm install -g completed. Start the app again and run atlas-docs --version to verify.`);
    }
    return;
  }

  throw Error('Automatic update path is not available. Library data was not changed.');
}

export async function maybeNotifyUpdate(packageRoot, currentVersion) {
  const result = await checkForUpdate(packageRoot, currentVersion, {force: false});
  if (result.skipped || !result.updateAvailable) return null;
  const advice = updateAdvice(result.install, result.latestVersion, result.install.packageName || 'atlas-docs');
  return {
    currentVersion,
    latestVersion: result.latestVersion,
    command: advice.command,
    note: advice.note,
    method: result.install.method,
  };
}
