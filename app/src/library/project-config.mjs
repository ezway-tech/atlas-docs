import {readFile, writeFile, access} from 'node:fs/promises';
import path from 'node:path';
import {AtlasError} from './errors.mjs';
import {PROJECT_CONFIG, canonicalize} from './paths.mjs';

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Walk from startDir up to filesystem root looking for atlas-docs.config.json. */
export async function findProjectConfig(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(current, PROJECT_CONFIG);
    if (await fileExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * @returns {{configPath: string, dataDir: string, raw: object}}
 */
export async function readProjectConfig(configPath) {
  let rawText;
  try {
    rawText = await readFile(configPath, 'utf8');
  } catch (error) {
    throw new AtlasError('config.unreadable', `Cannot read project config: ${configPath}`, {configPath, cause: error.code});
  }
  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw new AtlasError('config.invalid', `Project config is not valid JSON: ${configPath}`, {configPath});
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AtlasError('config.invalid', `Project config must be an object: ${configPath}`, {configPath});
  }
  if (typeof raw.dataDir !== 'string' || !raw.dataDir.trim()) {
    throw new AtlasError('config.invalid', `Project config needs a non-empty string "dataDir": ${configPath}`, {configPath});
  }
  const base = path.dirname(configPath);
  const dataDir = path.isAbsolute(raw.dataDir) ? path.resolve(raw.dataDir) : path.resolve(base, raw.dataDir);
  return {configPath, dataDir: canonicalize(dataDir), raw};
}

/**
 * Persist project library path. Same-volume paths are stored relative to the
 * config file directory. Cross-drive / absolute Windows paths stay absolute —
 * never prefix a drive path with "./".
 */
export async function writeProjectConfig(cwd, dataDir) {
  const configPath = path.join(path.resolve(cwd), PROJECT_CONFIG);
  const absolute = path.resolve(dataDir);
  const configDir = path.dirname(configPath);
  const relative = path.relative(configDir, absolute);
  const crossDrive =
    path.isAbsolute(relative) ||
    (process.platform === 'win32' &&
      path.parse(configDir).root.toLowerCase() !== path.parse(absolute).root.toLowerCase());
  let stored;
  if (crossDrive || relative === '') {
    stored = canonicalize(absolute);
  } else {
    const normalized = (relative || '.').split(path.sep).join('/');
    stored = normalized.startsWith('.') ? normalized : `./${normalized}`;
  }
  const body = `${JSON.stringify({dataDir: stored}, null, 2)}\n`;
  await writeFile(configPath, body, 'utf8');
  return {configPath, dataDir: canonicalize(absolute)};
}
