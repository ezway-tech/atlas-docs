import readline from 'node:readline';
import {isAtlasError} from '../library/errors.mjs';

export function printError(error) {
  const message = error?.message || String(error);
  console.error(`[Atlas Docs] ${message}`);
  if (isAtlasError(error) && error.code) {
    if (error.code.startsWith('library.') || error.code.startsWith('migrate.') || error.code.startsWith('config.') || error.code.startsWith('registry.') || error.code.startsWith('fs.')) {
      console.error('[Atlas Docs] Data was not modified unless a message above says otherwise.');
    }
  }
}

export function printHelp() {
  console.log(`Atlas Docs — local documentation library

Usage:
  atlas-docs [start] [options]
  atlas-docs library use <path>
  atlas-docs library info
  atlas-docs update [--check]
  atlas-docs doctor
  atlas-docs --help
  atlas-docs --version

Options:
  --data-dir <path>  Library root for this run (does not rewrite project config)
  --port <number>    Local port (default 17430; if omitted and busy, try 17431-17439)
  --no-open          Do not open a browser
  --yes              Confirm schema migration without a prompt

Library selection order:
  1. --data-dir
  2. nearest atlas-docs.config.json
  3. valid recent library from this machine’s registry
  4. existing ./atlas-docs-data in the current directory (compatibility)
  5. Projects screen with one durable Example project

Relative --data-dir paths resolve from the calling directory.
Config dataDir paths resolve from the config file location.
Recent libraries are stored outside the library (Windows: LOCALAPPDATA/atlas-docs;
Linux: $XDG_CONFIG_HOME/atlas-docs or ~/.config/atlas-docs). Override with
ATLAS_DOCS_REGISTRY_DIR.

Automation: pass --data-dir to select a project; switching remains available.
A missing or empty explicit target is initialized; invalid directories are refused.
DATA_DIR and ATLAS_LIBRARY_MODE=fixed are no longer launcher settings.

Run two projects at once with different libraries and ports, for example:
  atlas-docs --data-dir ./docs-a --port 17430
  atlas-docs --data-dir ./docs-b --port 17431

The server listens only on 127.0.0.1. With --port, a busy port is an error (no auto-fallback).
Press Ctrl+C to stop.`);
}

export async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  try {
    const answer = await new Promise(resolve => rl.question(question, resolve));
    return /^\s*y(es)?\s*$/i.test(answer || '');
  } finally {
    rl.close();
  }
}

export async function confirmMigrate(info) {
  console.log(`[Atlas Docs] App ${info.appVersion || '?'}`);
  console.log(`[Atlas Docs] Schema ${info.from ?? 'legacy'} → ${info.to}`);
  console.log(`[Atlas Docs] Library: ${info.root}`);
  console.log('[Atlas Docs] A full backup is created outside the library before changes.');
  return confirm('Continue with schema migration? [y/N] ');
}
