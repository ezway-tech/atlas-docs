import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {resolveLibraryPath, inspectLibrary, readLibraryLock, CURRENT_SCHEMA_VERSION, SUPPORTED_SCHEMAS} from '../../core/index.mjs';

export async function runDoctor(packageRoot, options, manifest) {
  const issues = [];
  const notes = [];

  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOk = major > 22 || (major === 22 && minor >= 12);
  console.log(`App version:     ${manifest.version}`);
  console.log(`Node.js:         ${process.versions.node}${nodeOk ? '' : ' (requires >= 22.12)'}`);
  if (!nodeOk) issues.push('Upgrade Node.js to 22.12 or newer.');

  console.log(`Supported schema:${SUPPORTED_SCHEMAS.join(', ')} (current ${CURRENT_SCHEMA_VERSION})`);

  let resolved;
  try {
    resolved = await resolveLibraryPath({
      dataDir: options.dataDirFlag,
      env: options.env || process.env,
      cwd: options.cwd || process.cwd(),
    });
  } catch (error) {
    issues.push(error.message);
    console.log(`Library resolve: FAILED`);
    console.log(`  ${error.message}`);
    printSummary(issues, notes);
    return;
  }

  console.log(`Library path:    ${resolved.root}`);
  console.log(`Path source:     ${resolved.source}`);

  const inspection = await inspectLibrary(resolved.root);
  console.log(`Library state:   ${inspection.state}`);
  console.log(`Schema version:  ${inspection.schemaVersion ?? 'none'}`);
  if (inspection.message) notes.push(inspection.message);

  if (inspection.state === 'newer') issues.push('Update the app or restore a compatible backup. Data was not changed.');
  if (inspection.state === 'unknown') issues.push('Path is not a valid Atlas Docs library. Data was not changed.');
  if (inspection.state === 'legacy') notes.push(`Run atlas-docs start --yes to migrate legacy → ${CURRENT_SCHEMA_VERSION} (creates an upgrade backup first).`);
  if (inspection.state === 'interrupted') issues.push(inspection.message || 'Interrupted operation needs recovery.');

  const lock = await readLibraryLock(resolved.root);
  if (lock) {
    console.log(`Lock:            pid ${lock.pid} purpose=${lock.purpose || '?'} heartbeat=${lock.heartbeatAt || '?'}`);
  } else {
    console.log('Lock:            none');
  }

  try {
    await readFile(path.join(packageRoot, 'runtime', 'server.js'));
    console.log('Runtime:         present');
  } catch {
    issues.push('Packaged runtime/server.js is missing. Reinstall the package.');
    console.log('Runtime:         missing');
  }

  printSummary(issues, notes);
  if (issues.length) process.exitCode = 1;
}

function printSummary(issues, notes) {
  if (notes.length) {
    console.log('\nNotes:');
    for (const n of notes) console.log(`- ${n}`);
  }
  if (issues.length) {
    console.log('\nIssues:');
    for (const i of issues) console.log(`- ${i}`);
  } else {
    console.log('\nDoctor: no blocking issues detected.');
  }
}
