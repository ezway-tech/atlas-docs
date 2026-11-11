import {runNpm, npmOutput, nodeSatisfies} from '../../library/update/npm.mjs';
import {checkForUpdate, updateAdvice, isNewerVersion} from '../../library/update/check.mjs';

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
    await runNpm(['install', '-g', '--prefix', result.install.globalPrefix, `${name}@${result.latestVersion}`]);
    // Verify by reading global package if possible
    try {
      const listed = npmOutput(['list', '-g', '--prefix', result.install.globalPrefix, name, '--depth', '0', '--json']);
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
