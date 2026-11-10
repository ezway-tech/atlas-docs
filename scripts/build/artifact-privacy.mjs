import {readFile, readdir, writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';

// Also recognizes JSON/JavaScript escaped separators. Never print matched values.
export function hasUserPath(text) {
  const normalized = text.replace(/\\+(?:u002[fF]|u005[cC])/g, '/').replace(/\\+/g, '/');
  return /(?:[a-z]:\/Users\/|\/(?:Users|home)\/)[^/\s"'<>]+/i.test(normalized);
}

export async function assertPrivatePathFreeTarball(file) {
  const tar = gunzipSync(await readFile(file));
  if (hasUserPath(tar.toString('utf8'))) {
    throw Error(`Personal home path found in package: ${path.basename(file)}`);
  }
}

// Next embeds build roots in diagnostic metadata and client reference keys.
// Replace every representation consistently, keeping relative suffixes intact.
export async function neutralizeBuildRoot(directory, root) {
  const variants = new Set([root, root.replaceAll('\\', '/')]);
  let escaped = root;
  for (let i = 0; i < 4; i++) {
    escaped = escaped.replaceAll('\\', '\\\\');
    variants.add(escaped);
  }
  const replacements = [...variants].sort((a, b) => b.length - a.length);
  const neutral = /^[a-z]:/i.test(root) ? 'C:/atlas-build/atlas-docs' : '/atlas-build/atlas-docs';
  async function walk(dir) {
    for (const entry of await readdir(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && /\.(?:js|json|map|mjs|cjs)$/.test(entry.name)) {
        const original = await readFile(file, 'utf8');
        let content = original;
        for (const value of replacements) content = content.replaceAll(value, neutral);
        if (content !== original) await writeFile(file, content);
      }
    }
  }
  await walk(directory);
}
