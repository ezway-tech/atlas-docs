import {migration as legacyTo1} from './legacy-to-1.mjs';
import {AtlasError} from '../errors.mjs';
import {CURRENT_SCHEMA_VERSION, isSupportedSchema} from '../schema.mjs';

const PRODUCTION = [legacyTo1];

/**
 * @param {typeof PRODUCTION} [extra] test-only migrations (future schemas). Never ship fakes in production callers.
 */
export function listMigrations(extra = []) {
  return [...PRODUCTION, ...extra];
}

/**
 * Build an ordered migration chain from `fromVersion` (null = legacy) to `toVersion`.
 */
export function planMigration(fromVersion, toVersion = CURRENT_SCHEMA_VERSION, extra = []) {
  if (fromVersion === toVersion) return [];
  if (fromVersion != null && fromVersion > toVersion) {
    throw new AtlasError('migrate.downgrade', 'Refusing to downgrade library schema.');
  }
  if (!isSupportedSchema(toVersion) && !(extra.length && extra.some(m => m.to === toVersion))) {
    // Allow test extras to target unsupported schemas only when provided.
    if (!extra.length) throw new AtlasError('migrate.unsupported', `Target schema ${toVersion} is not supported.`);
  }

  const all = listMigrations(extra);
  const steps = [];
  let current = fromVersion;

  while (current !== toVersion) {
    const expectedTo = current == null ? 1 : current + 1;
    const next = all.find(m => Object.is(m.from, current) && m.to === expectedTo);
    if (!next) {
      throw new AtlasError('migrate.noPath', `No migration path from schema ${current} to ${toVersion}.`);
    }
    steps.push(next);
    current = next.to;
    if (steps.length > 50) throw new AtlasError('migrate.noPath', 'Migration path is unexpectedly long.');
    if (current === toVersion) break;
    if (current > toVersion) {
      throw new AtlasError('migrate.noPath', `Migration overshot target schema ${toVersion}.`);
    }
  }
  return steps;
}

export {PRODUCTION as productionMigrations};
