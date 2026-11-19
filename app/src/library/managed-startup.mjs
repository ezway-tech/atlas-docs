import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {access} from 'node:fs/promises';
import {inspectLibrary} from './inspect.mjs';
import {inspectOpenTarget} from './library-ops.mjs';
import {getRecentLibrary, ensureRegistered, rememberSuccessfulOpen} from './user-registry.mjs';
import {resolveAllowedRoots, assertWithinAllowedRoots} from './fs-policy.mjs';
import {ensureDemoLibrary} from './demo-library.mjs';
import {canonicalize} from './paths.mjs';

async function loadSeedDemo(packageRoot, env) {
  const candidates = [
    env.ATLAS_SEED_DEMO,
    packageRoot ? path.join(packageRoot, 'demo', 'seed-demo.mjs') : null,
    packageRoot ? path.join(packageRoot, 'scripts', 'setup', 'seed-demo.mjs') : null,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/setup/seed-demo.mjs'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      const module = await import(pathToFileURL(candidate).href);
      const sample = env.ATLAS_DEMO_ROOT || (packageRoot && candidate === path.join(packageRoot, 'demo', 'seed-demo.mjs')
        ? path.join(packageRoot, 'demo', 'little-cafe') : module.demoRoot);
      return {seedDemo: root => module.seedDemo(root, sample)};
    } catch {
      // try next
    }
  }
  throw Error('Demo seed module not found for Example project.');
}

async function describeUnusable(root) {
  const inspection = await inspectLibrary(root);
  if (inspection.state === 'missing') {
    return {code: 'recent.missing', message: `Recent project folder is missing: ${root}`, path: root};
  }
  if (inspection.state === 'empty' || inspection.state === 'unknown' || inspection.state === 'newer') {
    return {
      code: `recent.${inspection.state}`,
      message: inspection.message || `Recent project is not openable (${inspection.state}): ${root}`,
      path: root,
    };
  }
  return null;
}

/**
 * Resolve which project a managed (non-fixed) launcher should open.
 * - Prefer a valid recent project.
 * - Otherwise ensure Example once and open it.
 * - Optionally register an existing repo data/ folder into the list without replacing Example.
 */
export async function resolveManagedStartupProject({
  env = process.env,
  packageRoot,
  companionDataRoot,
  openLibrary,
  seed,
} = {}) {
  const allowedRoots = resolveAllowedRoots(env);
  if (openLibrary) {
    const root = canonicalize(openLibrary);
    const inspected = await inspectOpenTarget(root, allowedRoots);
    if (!inspected.openable) {
      throw Error(inspected.error?.message || `Cannot open project: ${root}`);
    }
    await rememberSuccessfulOpen(root, {env});
    if (companionDataRoot) {
      await registerCompanionIfReady(companionDataRoot, env);
    }
    try {
      const seedMod = seed || await loadSeedDemo(packageRoot, env);
      await ensureDemoLibrary({allowedRoots, seed: seedMod.seedDemo, env, remember: false});
    } catch (error) {
      // The read-only project list exposes unavailable Example state; keep the chosen project open.
      console.warn(`[Atlas Docs] Example unavailable: ${error.message}`);
    }
    return {root, displayName: path.basename(root), source: 'open', mode: 'library'};
  }

  if (companionDataRoot) {
    await registerCompanionIfReady(companionDataRoot, env);
  }

  const {entry: recent} = await getRecentLibrary(env);
  if (recent) {
    const bad = await describeUnusable(recent.path);
    if (!bad) {
      // Keep Example available in the list without forcing it open.
      try {
        const seedMod = seed || (await loadSeedDemo(packageRoot, env));
        await ensureDemoLibrary({
          allowedRoots,
          seed: seedMod.seedDemo,
          env,
          remember: false,
        });
      } catch (error) {
        console.warn(`[Atlas Docs] Example unavailable: ${error.message}`);
      }
      return {
        root: recent.path,
        displayName: recent.displayName || path.basename(recent.path),
        source: 'recent',
        mode: 'library',
      };
    }
  }

  const seedMod = seed || (await loadSeedDemo(packageRoot, env));
  const example = await ensureDemoLibrary({
    allowedRoots,
    seed: seedMod.seedDemo,
    env,
    remember: true,
  });
  return {
    root: example.path,
    displayName: example.displayName || 'Example',
    source: 'example',
    mode: 'library',
  };
}

async function registerCompanionIfReady(companionDataRoot, env) {
  const root = canonicalize(companionDataRoot);
  const inspection = await inspectLibrary(root);
  if (inspection.state !== 'ready' && inspection.state !== 'legacy' && inspection.state !== 'interrupted') {
    return null;
  }
  try {
    await assertWithinAllowedRoots(root, resolveAllowedRoots(env), {mustExist: true});
  } catch {
    // Tests and constrained mounts should not pull host companion paths into the registry.
    return null;
  }
  await ensureRegistered(root, {displayName: path.basename(root) || 'data', env});
  return root;
}
