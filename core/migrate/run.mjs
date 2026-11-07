import {readFile, writeFile, rename, unlink, mkdir, access} from 'node:fs/promises';
import path from 'node:path';
import {AtlasError} from '../errors.mjs';
import {canonicalize, migrateJournalPath} from '../paths.mjs';
import {createFullBackup, verifyFullBackup} from '../full-backup.mjs';
import {acquireLibraryLock} from '../lock.mjs';
import {CURRENT_SCHEMA_VERSION} from '../schema.mjs';
import {inspectLibrary} from '../inspect.mjs';
import {planMigration} from './registry.mjs';

async function writeJournal(root, journal) {
  const file = migrateJournalPath(root);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(journal, null, 2)}\n`);
  await rename(tmp, file);
}

async function clearJournal(root) {
  await unlink(migrateJournalPath(root)).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
}

async function readJournal(root) {
  try {
    return JSON.parse(await readFile(migrateJournalPath(root), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Recover an interrupted migration when a verified backup exists.
 * Restores db.json from the backup and clears the journal. Does not delete the backup.
 */
export async function recoverInterruptedMigration(libraryRoot, {restore = true} = {}) {
  const root = canonicalize(libraryRoot);
  const journal = await readJournal(root);
  if (!journal) return {recovered: false};
  if (!journal.backupDir) {
    throw new AtlasError(
      'migrate.interrupted',
      'Migration was interrupted without a usable backup pointer. Restore the library manually from an external copy.',
      {root, journal},
    );
  }
  await verifyFullBackup(journal.backupDir);
  if (restore) {
    const src = path.join(journal.backupDir, 'db.json');
    await access(src);
    const dest = path.join(root, 'db.json');
    const bytes = await readFile(src);
    const tmp = `${dest}.recover.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, dest);
  }
  await clearJournal(root);
  return {recovered: true, backupDir: journal.backupDir, journal};
}

/**
 * Run schema migrations with confirmation already handled by the caller.
 */
export async function migrateLibrary(libraryRoot, {
  appVersion,
  backupParentDir,
  confirm = true,
  extraMigrations = [],
  lockHolder = null,
  log = console.log,
} = {}) {
  if (!confirm) {
    throw new AtlasError('migrate.needsConfirm', 'Migration requires confirmation (TTY prompt or --yes).');
  }

  const root = canonicalize(libraryRoot);
  const ownLock = !lockHolder;
  const lock = lockHolder || await acquireLibraryLock(root, 'migrate');

  try {
    const existingJournal = await readJournal(root);
    if (existingJournal) {
      throw new AtlasError(
        'migrate.interrupted',
        'A previous migration was interrupted. Run recovery before migrating again.',
        {root},
      );
    }

    const inspection = await inspectLibrary(root);
    if (inspection.state === 'ready' && inspection.schemaVersion === CURRENT_SCHEMA_VERSION) {
      return {migrated: false, schemaVersion: CURRENT_SCHEMA_VERSION, reason: 'already-current'};
    }
    if (inspection.state === 'newer') {
      throw new AtlasError('library.newerSchema', inspection.message, {schemaVersion: inspection.schemaVersion});
    }
    if (inspection.state !== 'legacy' && !(inspection.state === 'ready' && inspection.schemaVersion != null && inspection.schemaVersion < CURRENT_SCHEMA_VERSION)) {
      throw new AtlasError('migrate.notNeeded', `Library state "${inspection.state}" is not migratable.`, {state: inspection.state});
    }

    const fromVersion = inspection.schemaVersion;
    const steps = planMigration(fromVersion, CURRENT_SCHEMA_VERSION, extraMigrations);
    if (!steps.length) return {migrated: false, schemaVersion: CURRENT_SCHEMA_VERSION};

    log(`[Atlas Docs] App ${appVersion || '?'}: migrate schema ${fromVersion ?? 'legacy'} → ${CURRENT_SCHEMA_VERSION}`);
    log(`[Atlas Docs] Library: ${root}`);

    const parent = backupParentDir || path.join(path.dirname(root), '.atlas-docs-upgrade-backups');
    await mkdir(parent, {recursive: true});
    const backup = await createFullBackup(root, parent);
    await verifyFullBackup(backup.backupDir);
    log(`[Atlas Docs] Upgrade backup: ${backup.backupDir}`);

    await writeJournal(root, {
      status: 'running',
      from: fromVersion,
      to: CURRENT_SCHEMA_VERSION,
      steps: steps.map(s => s.id),
      backupDir: backup.backupDir,
      startedAt: new Date().toISOString(),
      completedSteps: [],
    });

    for (const step of steps) {
      await step.precheck(root);
      await step.apply(root);
      await step.verify(root);
      const journal = await readJournal(root);
      journal.completedSteps.push(step.id);
      await writeJournal(root, journal);
    }

    // Clear the journal before inspect so the library is not classified as interrupted.
    await clearJournal(root);

    const final = await inspectLibrary(root);
    if (final.state !== 'ready' || final.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      throw new AtlasError('migrate.verifyFailed', 'Library is not ready at the target schema after migration.');
    }
    log(`[Atlas Docs] Migration complete. Backup kept at ${backup.backupDir}`);
    return {
      migrated: true,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      backupDir: backup.backupDir,
      steps: steps.map(s => s.id),
    };
  } finally {
    if (ownLock) await lock.release();
  }
}
