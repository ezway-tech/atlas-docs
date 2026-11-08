#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseOptions} from './options.mjs';
import {printHelp, printError} from './ui.mjs';
import {runStart} from './commands/start.mjs';
import {runLibrary} from './commands/library.mjs';
import {runDoctor} from './commands/doctor.mjs';
import {runUpdate, maybeNotifyUpdate} from './commands/update.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, path.basename(here) === 'bin' ? '..' : '../..');
try {
  const options = parseOptions(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (options.help) printHelp();
  else if (options.version) console.log(manifest.version);
  else if (options.command === 'library') await runLibrary(options.libraryArgs, options.cwd || process.cwd());
  else if (options.command === 'doctor') await runDoctor(root, options, manifest);
  else if (options.command === 'update') await runUpdate(root, options, manifest);
  else {
    // Background update notice must not block or mix into structured agent output.
    maybeNotifyUpdate(root, manifest.version)
      .then(notice => {
        if (!notice) return;
        console.log(`[Atlas Docs] Update available: ${notice.currentVersion} → ${notice.latestVersion}`);
        if (notice.command) console.log(`[Atlas Docs] ${notice.command}`);
      })
      .catch(() => {});
    await runStart(root, options, manifest);
  }
} catch (error) {
  printError(error);
  process.exitCode = 1;
}
