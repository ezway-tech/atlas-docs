import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {inspectLibrary} from './inspect.mjs';
import {canonicalize} from './paths.mjs';

const FOLDER_NAME = /^[a-z0-9][a-z0-9_ -]*$/;
const MD_FILE = /^[a-z0-9][a-z0-9_ -]*\.md$/;
const DATA_FILE = /^[a-z0-9][a-z0-9_ -]*\.(yml|yaml|sql|json)$/;

/**
 * Count docs/folders under a library docs/ tree using the same naming rules as the workspace catalog.
 * Read-only readdir — does not open document contents or take a library lock.
 */
export async function countDocsTree(docsRoot, prefix = '', depth = 1, files = [], folders = []) {
  let list;
  try {
    list = await readdir(docsRoot, {withFileTypes: true});
  } catch {
    return {files, folders};
  }
  for (const entry of list) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory() && depth <= 3 && FOLDER_NAME.test(entry.name)) {
      folders.push(key);
      await countDocsTree(path.join(docsRoot, entry.name), key, depth + 1, files, folders);
    } else if (entry.isFile() && prefix && MD_FILE.test(entry.name)) {
      files.push(key.slice(0, -3));
    } else if (entry.isFile() && prefix && DATA_FILE.test(entry.name)) {
      files.push(key);
    }
  }
  return {files, folders};
}

/**
 * Lightweight project summary for the Projects detail pane.
 * @returns {{
 *   root: string,
 *   state: string,
 *   schemaVersion: number|null,
 *   counts: {docs:number,folders:number,topics:number,comments:number,assets:number}|null,
 *   error?: string|null,
 * }}
 */
export async function summarizeLibraryProject(libraryRoot) {
  const root = canonicalize(libraryRoot);
  const inspection = await inspectLibrary(root);
  if (inspection.state === 'missing') {
    return {
      root,
      state: inspection.state,
      schemaVersion: null,
      counts: null,
      error: `Path does not exist: ${root}`,
    };
  }
  if (!inspection.db) {
    return {
      root,
      state: inspection.state,
      schemaVersion: inspection.schemaVersion ?? null,
      counts: null,
      error: inspection.message || `Cannot read project database at ${root}`,
    };
  }

  const tree = await countDocsTree(path.join(root, 'docs'));
  const topics = tree.folders.filter(folderPath => folderPath.split('/').length === 1).length;
  return {
    root,
    state: inspection.state,
    schemaVersion: inspection.schemaVersion ?? null,
    counts: {
      docs: tree.files.length,
      folders: tree.folders.length,
      topics,
      comments: Array.isArray(inspection.db.comments) ? inspection.db.comments.length : 0,
      assets: Array.isArray(inspection.db.assets) ? inspection.db.assets.length : 0,
    },
    error: null,
  };
}
