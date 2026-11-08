import readline from 'node:readline';
import {isAtlasError} from '../library/errors.mjs';

export function printError(error) {
  const message = error?.message || String(error);
  console.error(`[Atlas Docs] ${message}`);
  if (isAtlasError(error) && error.code) {
    if (error.code.startsWith('library.') || error.code.startsWith('migrate.') || error.code.startsWith('config.')) {
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
  --port <number>    Local port, default 3000
  --no-open          Do not open a browser
  --yes              Confirm schema migration without a prompt

Library selection order: --data-dir, DATA_DIR, nearest atlas-docs.config.json, ./atlas-docs-data.
Relative --data-dir and DATA_DIR paths resolve from the calling directory.
Config dataDir paths resolve from the config file location.
The server listens only on 127.0.0.1. Press Ctrl+C to stop.`);
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
