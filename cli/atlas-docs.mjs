#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseOptions} from './options.mjs';
import {installAgentKit} from './init-library.mjs';
import {assertPortAvailable, startServer} from './start.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const options = parseOptions(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (options.help) console.log(`Atlas Docs — local documentation library
Usage: atlas-docs [--data-dir <path>] [--port <number>] [--no-open]
  --data-dir  Library root (then DATA_DIR, then ./atlas-docs-data)
  --port      Local port, default 3000
  --no-open   Do not open a browser
  --help      Show this help
  --version   Show package version
Relative paths resolve from the directory where you run this command.
The server listens only on 127.0.0.1. Press Ctrl+C to stop.`);
  else if (options.version) console.log(manifest.version);
  else {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || major === 22 && minor < 12) throw Error('Node.js 22.12 or newer is required');
    await assertPortAvailable(options.port);
    process.env.DATA_DIR = options.dataDir;
    await import(pathToFileURL(path.join(root, 'bin/bootstrap.mjs')).href);
    await installAgentKit(options.dataDir, path.join(root, 'agent-kit'));
    await startServer(root, options);
  }
} catch (error) {
  console.error(`[Atlas Docs] ${error.message}`);
  process.exitCode = 1;
}
