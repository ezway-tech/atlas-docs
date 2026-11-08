import {AtlasError} from './errors.mjs';
import {inspectLibrary, assertOpenable} from './inspect.mjs';
import {acquireLibraryLock} from './lock.mjs';
import {initEmptyLibrary} from './init.mjs';
import {migrateLibrary, recoverInterruptedMigration} from './migrate/run.mjs';
import {installAgentKit} from './agent-kit.mjs';
import {CURRENT_SCHEMA_VERSION} from './schema.mjs';
import {canonicalize} from './paths.mjs';
import path from 'node:path';

/**
 * Shared open pipeline used by CLI, source bootstrap, and Docker.
 */
export async function prepareLibrary({
  libraryRoot,
  appVersion,
  allowInit = true,
  allowMigrate = true,
  migrateConfirmed = false,
  autoConfirmMigrate = false,
  confirmMigrate,
  agentKitPath = null,
  holdLock = true,
  backupParentDir,
  log = console.log,
} = {}) {
  const root = canonicalize(libraryRoot);

  let inspection = await inspectLibrary(root);
  await assertOpenable(inspection);

  if (inspection.state === 'interrupted' && inspection.interrupted === 'migrate') {
    log('[Atlas Docs] Recovering interrupted schema migration…');
    await recoverInterruptedMigration(root);
    inspection = await inspectLibrary(root);
    await assertOpenable(inspection);
  }

  if (inspection.state === 'newer') {
    throw new AtlasError('library.newerSchema', inspection.message, {schemaVersion: inspection.schemaVersion, root});
  }
  if (inspection.state === 'unknown') {
    throw new AtlasError('library.unknown', inspection.message || 'Not a valid Atlas Docs library.', {root});
  }

  const lock = await acquireLibraryLock(root, 'server');
  try {
    inspection = await inspectLibrary(root);
    await assertOpenable(inspection);

    if (inspection.state === 'interrupted' && inspection.interrupted === 'migrate') {
      await recoverInterruptedMigration(root);
      inspection = await inspectLibrary(root);
    }

    const importInterrupted = inspection.state === 'interrupted' && inspection.interrupted === 'import';

    if (!importInterrupted && (inspection.state === 'missing' || inspection.state === 'empty')) {
      if (!allowInit) {
        throw new AtlasError('library.missing', `Library does not exist or is empty: ${root}`, {root});
      }
      await initEmptyLibrary(root);
      inspection = await inspectLibrary(root);
    }

    if (
      !importInterrupted &&
      (inspection.state === 'legacy' ||
        (inspection.state === 'ready' && inspection.schemaVersion != null && inspection.schemaVersion < CURRENT_SCHEMA_VERSION))
    ) {
      if (!allowMigrate) {
        throw new AtlasError('migrate.required', `Library schema needs migration to ${CURRENT_SCHEMA_VERSION}.`, {
          root,
          schemaVersion: inspection.schemaVersion,
        });
      }
      const info = {
        appVersion,
        from: inspection.schemaVersion,
        to: CURRENT_SCHEMA_VERSION,
        root,
      };
      let confirmed = migrateConfirmed || autoConfirmMigrate;
      if (!confirmed && confirmMigrate) confirmed = await confirmMigrate(info);
      if (!confirmed) {
        throw new AtlasError(
          'migrate.needsConfirm',
          `Library at ${root} needs schema migration (${inspection.schemaVersion ?? 'legacy'} → ${CURRENT_SCHEMA_VERSION}). Re-run with --yes to confirm.`,
          info,
        );
      }
      await migrateLibrary(root, {
        appVersion,
        backupParentDir: backupParentDir || path.join(path.dirname(root), '.atlas-docs-upgrade-backups'),
        confirm: true,
        lockHolder: lock,
        log,
      });
      inspection = await inspectLibrary(root);
    }

    if (!importInterrupted) {
      if (inspection.state === 'legacy') {
        throw new AtlasError('migrate.required', 'Legacy library was not migrated.', {root});
      }
      if (inspection.state !== 'ready') {
        throw new AtlasError('library.unknown', `Library is not ready after prepare (state=${inspection.state}).`, {
          root,
          state: inspection.state,
        });
      }
      if (inspection.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new AtlasError('migrate.required', `Library schema is ${inspection.schemaVersion}, expected ${CURRENT_SCHEMA_VERSION}.`, {
          root,
        });
      }
    }

    if (agentKitPath && !importInterrupted) {
      await installAgentKit(root, agentKitPath, log);
    }

    if (!holdLock) {
      await lock.release();
      return {root, inspection, lock: null, importInterrupted};
    }
    return {root, inspection, lock, importInterrupted};
  } catch (error) {
    await lock.release();
    throw error;
  }
}
