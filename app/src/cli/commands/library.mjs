import path from 'node:path';
import {inspectLibrary, writeProjectConfig, resolveLibraryPath, CURRENT_SCHEMA_VERSION} from '../../library/index.mjs';
import {AtlasError} from '../../library/errors.mjs';

export async function runLibrary(args, cwd = process.cwd()) {
  const sub = args[0];
  if (sub === 'use') {
    const target = args[1];
    if (!target) throw Error('Usage: atlas-docs library use <path>');
    const root = path.resolve(cwd, target);
    const inspection = await inspectLibrary(root);
    if (inspection.state === 'missing') {
      throw new AtlasError(
        'library.missing',
        `Path does not exist: ${root}. Create the library directory first, or point to an existing library. Data was not changed.`,
        {root},
      );
    }
    if (inspection.state === 'unknown' || inspection.state === 'newer') {
      throw new AtlasError(
        inspection.state === 'newer' ? 'library.newerSchema' : 'library.unknown',
        `${inspection.message || 'Not a valid Atlas Docs library.'} Data was not changed.`,
        {root},
      );
    }
    // Allow empty, legacy, ready, interrupted-import — remember the path; start will prepare.
    const saved = await writeProjectConfig(cwd, root);
    console.log(`[Atlas Docs] Using library ${saved.dataDir}`);
    console.log(`[Atlas Docs] Wrote ${saved.configPath}`);
    if (inspection.state === 'legacy') {
      console.log(`[Atlas Docs] Note: library is legacy (no schemaVersion). Next start will migrate to ${CURRENT_SCHEMA_VERSION} after confirmation.`);
    }
    return;
  }

  if (sub === 'info') {
    let resolved;
    try {
      resolved = await resolveLibraryPath({cwd});
    } catch (error) {
      throw error;
    }
    const inspection = await inspectLibrary(resolved.root);
    console.log(`Library: ${resolved.root}`);
    console.log(`Source:  ${resolved.source}${resolved.configPath ? ` (${resolved.configPath})` : ''}`);
    console.log(`State:   ${inspection.state}`);
    console.log(`Schema:  ${inspection.schemaVersion ?? (inspection.state === 'legacy' ? 'legacy' : 'n/a')}`);
    console.log(`App supports schema: ${CURRENT_SCHEMA_VERSION}`);
    if (inspection.message) console.log(`Detail:  ${inspection.message}`);
    return;
  }

  throw Error('Usage: atlas-docs library use <path> | atlas-docs library info');
}
