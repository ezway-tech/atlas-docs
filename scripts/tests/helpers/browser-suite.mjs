import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {appRoot,appRequire} from '../../dependencies.mjs';

export async function runBrowserSuite(suite) {
  if (!['headings','responsive'].includes(suite)) throw Error('Unknown browser suite');
  const library = await mkdtemp(path.join(tmpdir(),'atlas-browser-'));
  const env = {...process.env, DATA_DIR:library, ATLAS_DIST_DIR:`test-results/builds/${suite}-check`};
  try {
    for (const args of [
      ['../scripts/build/prepare-help.mjs'],
      [appRequire.resolve('next/dist/bin/next'),'build'],
      [appRequire.resolve('@playwright/test/cli'),'test','--config',`playwright.${suite}.config.ts`,...process.argv.slice(2)],
    ]) {
      const result = spawnSync(process.execPath,args,{cwd:appRoot,env,stdio:'inherit',windowsHide:true});
      if (result.error) throw result.error;
      if (result.status !== 0) throw Error(`${suite} check failed (${result.status})`);
    }
  } finally {
    await rm(library,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}
